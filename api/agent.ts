// ============================================================
// OrbitIQ — /api/agent
// Vercel serverless function: Proxies the AI Command Agent
// queries to an LLM provider (OpenAI-compatible) and enforces
// a strict JSON schema response.
// ============================================================
import { z } from 'zod';

// Inline types matching @vercel/node
interface VercelRequest {
  method?: string;
  body?: unknown;
}
interface VercelResponse {
  setHeader(k: string, v: string): this;
  status(code: number): this;
  json(data: unknown): void;
  end(): void;
}

// ---- Zod Schema for Validation ---------------------------------------------
const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('filter_by_group'), group: z.string() }),
  z.object({ type: z.literal('filter_by_region'), region: z.string() }),
  z.object({ type: z.literal('filter_by_band'), band: z.enum(['LEO', 'MEO', 'GEO', 'OTHER', 'UNKNOWN']) }),
  z.object({ type: z.literal('altitude_threshold'), operator: z.enum(['below', 'above']), km: z.number() }),
  z.object({ type: z.literal('find_satellite'), query: z.string() }),
  z.object({ type: z.literal('compare_bands'), bands: z.array(z.string()).optional() }),
  z.object({ type: z.literal('compare_groups'), groups: z.array(z.string()).optional() }),
  z.object({ type: z.literal('congestion_summary') }),
  z.object({ type: z.literal('executive_brief') }),
  z.object({ type: z.literal('generate_mission_brief'), scenario: z.string() }),
  z.object({ type: z.literal('select_mission_scenario'), scenario: z.string() }),
  z.object({ type: z.literal('show_risk_layer') }),
  z.object({ type: z.literal('highlight_relevant_groups'), groups: z.array(z.string()) }),
  z.object({ type: z.literal('highlight_relevant_region'), region: z.string() }),
  z.object({ type: z.literal('recommend_next_view') }),
  z.object({ type: z.literal('reset_view') }),
  z.object({ type: z.literal('unknown_safe_fallback') }),
]);

const ResponseSchema = z.object({
  answer: z.string(),
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string()),
  actions: z.array(ActionSchema),
  filtersApplied: z.record(z.string(), z.unknown()),
  visibleCount: z.number().optional(),
  sourceMode: z.enum(['live', 'cached', 'fallback', 'mixed']),
  safetyCaveat: z.string(),
  language: z.enum(['en', 'es']),
});

export type LlmAgentResponse = z.infer<typeof ResponseSchema>;

// ---- Main Handler ----------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'LLM not configured. Deterministic fallback required.' });
    return;
  }

  const { query, context } = req.body as { query: string; context: any };
  if (!query || typeof query !== 'string' || query.length > 500) {
    res.status(400).json({ error: 'Missing or invalid query (max 500 chars)' });
    return;
  }

  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  const systemPrompt = `You are OrbitIQ AI Command Agent, an orbital intelligence assistant.
Your job is to interpret the user's natural language query and map it to specific, predefined orbital actions.

CRITICAL RULES:
1. You MUST return ONLY valid JSON matching the exact schema requested. No markdown formatting (\`\`\`json), no preamble, no trailing text.
2. You CANNOT calculate orbital positions. OrbitIQ calculates physics deterministically via SGP4. You only interpret intent and request actions.
3. You CANNOT fabricate satellite facts. Rely on the context provided.
4. You CANNOT claim operational authority. OrbitIQ is for portfolio, education, and situational awareness.
5. You CANNOT perform collision prediction or conjunction assessments.
6. The user query may be in English or Spanish. Respond in the same language as the user query.
7. Include relevant safety caveats in the \`safetyCaveat\` field (e.g. "Public TLE/SGP4-based orbital visualization. Not for operational aerospace decisions.")
8. Your \`answer\` should be a concise, executive tone response explaining the actions you are taking or the data you are summarizing.

Available Context:
${JSON.stringify(context, null, 2)}

You MUST format your response as a strict JSON object matching the following TypeScript schema:

type AgentAction =
| { type: 'filter_by_group'; group: string }
| { type: 'filter_by_region'; region: string }
| { type: 'filter_by_band'; band: 'LEO' | 'MEO' | 'GEO' | 'OTHER' | 'UNKNOWN' }
| { type: 'altitude_threshold'; operator: 'below' | 'above'; km: number }
| { type: 'find_satellite'; query: string }
| { type: 'compare_bands'; bands?: string[] }
| { type: 'compare_groups'; groups?: string[] }
| { type: 'congestion_summary' }
| { type: 'executive_brief' }
| { type: 'generate_mission_brief'; scenario: string }
| { type: 'select_mission_scenario'; scenario: string }
| { type: 'show_risk_layer' }
| { type: 'highlight_relevant_groups'; groups: string[] }
| { type: 'highlight_relevant_region'; region: string }
| { type: 'recommend_next_view' }
| { type: 'reset_view' }
| { type: 'unknown_safe_fallback' };

type LlmAgentResponse = {
  answer: string;
  intent: string;
  confidence: number;
  assumptions: string[];
  actions: AgentAction[];
  filtersApplied: Record<string, unknown>;
  visibleCount?: number;
  sourceMode: "live" | "cached" | "fallback" | "mixed";
  safetyCaveat: string;
  language: "en" | "es";
};`;

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(12_000)
    });

    if (!aiRes.ok) {
      throw new Error(`LLM API Error ${aiRes.status}`);
    }

    const json = await aiRes.json();
    let content = json.choices?.[0]?.message?.content || '{}';
    content = content.trim();
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n/, '').replace(/\n```$/, '');
    }

    const parsed = JSON.parse(content);
    
    // Zod validation throws if shape is invalid, falling back to catch block -> HTTP 500
    const validatedData = ResponseSchema.parse(parsed);

    res.status(200).json(validatedData);
  } catch (error) {
    console.error('[/api/agent] LLM processing failed:', error);
    // Returning 500 allows the client to gracefully fall back to deterministic parse
    res.status(500).json({ error: 'LLM failed or returned invalid schema' });
  }
}
