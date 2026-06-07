// ============================================================
// OrbitIQ — /api/agent
// Vercel serverless function: Proxies AI Command Agent queries
// to Gemini (primary) or OpenAI-compatible (fallback).
// ============================================================
import { z } from 'zod';

interface VercelRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  setHeader(k: string, v: string): this;
  status(code: number): this;
  json(data: unknown): void;
  end(): void;
}

// ---- Zod Schema for Validation ---------------------------------------------
const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('filter_by_group'), group: z.string().min(1).max(80) }),
  z.object({ type: z.literal('filter_by_region'), region: z.string().min(1).max(80) }),
  z.object({ type: z.literal('filter_by_band'), band: z.enum(['LEO', 'MEO', 'GEO', 'OTHER', 'UNKNOWN']) }),
  z.object({ type: z.literal('altitude_threshold'), operator: z.enum(['below', 'above']), km: z.number().min(0).max(50000) }),
  z.object({ type: z.literal('find_satellite'), query: z.string().min(1).max(120) }),
  z.object({ type: z.literal('compare_bands'), bands: z.array(z.string().max(20)).max(4).optional() }),
  z.object({ type: z.literal('compare_groups'), groups: z.array(z.string().max(40)).max(8).optional() }),
  z.object({ type: z.literal('congestion_summary') }),
  z.object({ type: z.literal('executive_brief') }),
  z.object({ type: z.literal('generate_mission_brief'), scenario: z.string().min(1).max(80) }),
  z.object({ type: z.literal('select_mission_scenario'), scenario: z.string().min(1).max(80) }),
  z.object({ type: z.literal('show_risk_layer') }),
  z.object({ type: z.literal('highlight_relevant_groups'), groups: z.array(z.string().max(40)).min(1).max(8) }),
  z.object({ type: z.literal('highlight_relevant_region'), region: z.string().min(1).max(80) }),
  z.object({ type: z.literal('recommend_next_view') }),
  z.object({ type: z.literal('reset_view') }),
  z.object({ type: z.literal('set_time_mode'), mode: z.enum(['live', 'paused', 'simulating']) }),
  z.object({ type: z.literal('set_time_speed'), speed: z.number().min(0.25).max(360) }),
  z.object({ type: z.literal('jump_time'), offsetMs: z.number().int().min(-604800000).max(604800000) }),
  z.object({ type: z.literal('reset_to_now') }),
  z.object({ type: z.literal('pause_simulation') }),
  z.object({ type: z.literal('resume_simulation') }),
  z.object({ type: z.literal('add_to_watchlist') }),
  z.object({ type: z.literal('remove_from_watchlist') }),
  z.object({ type: z.literal('show_watchlist') }),
  z.object({ type: z.literal('save_current_view'), name: z.string().max(80).optional() }),
  z.object({ type: z.literal('load_saved_view'), viewIdOrName: z.string().max(80).optional() }),
  z.object({ type: z.literal('create_snapshot') }),
  z.object({ type: z.literal('export_snapshot') }),
  z.object({ type: z.literal('recommend_saved_view') }),
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

function header(req: VercelRequest, key: string): string | undefined {
  const value = req.headers?.[key] ?? req.headers?.[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function logEvent(level: 'info' | 'error', data: Record<string, unknown>): void {
  const payload = JSON.stringify({
    level,
    route: '/api/agent',
    ...data,
  });
  if (level === 'error') console.error(payload);
  else console.log(payload);
}

// ---- Shared system prompt --------------------------------------------------

function buildSystemPrompt(context: unknown): string {
  return `You are OrbitIQ AI Command Agent, an orbital intelligence assistant.
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
| { type: 'set_time_mode'; mode: 'live' | 'paused' | 'simulating' }
| { type: 'set_time_speed'; speed: number }
| { type: 'jump_time'; offsetMs: number }
| { type: 'reset_to_now' }
| { type: 'pause_simulation' }
| { type: 'resume_simulation' }
| { type: 'add_to_watchlist' }
| { type: 'remove_from_watchlist' }
| { type: 'show_watchlist' }
| { type: 'save_current_view'; name?: string }
| { type: 'load_saved_view'; viewIdOrName?: string }
| { type: 'create_snapshot' }
| { type: 'export_snapshot' }
| { type: 'recommend_saved_view' }
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
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function sanitizeConversationHistory(history: unknown): ConversationMessage[] {
  if (!Array.isArray(history)) return [];

  return history
    .filter((m): m is ConversationMessage => {
      if (typeof m !== 'object' || m === null) return false;
      const candidate = m as Partial<ConversationMessage>;
      return (
        (candidate.role === 'user' || candidate.role === 'assistant') &&
        typeof candidate.content === 'string' &&
        candidate.content.trim().length > 0 &&
        candidate.content.length <= 2000
      );
    })
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .slice(-6);
}

// ---- Gemini call -----------------------------------------------------------

async function callGemini(
  apiKey: string,
  query: string,
  context: unknown,
  history: ConversationMessage[] = [],
): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  // Build multi-turn contents array from history + current query
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const msg of history) {
    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
  }
  contents.push({ role: 'user', parts: [{ text: query }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(context) }] },
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(12_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini API Error ${res.status}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

// ---- OpenAI call -----------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  query: string,
  context: unknown,
  history: ConversationMessage[] = [],
): Promise<string> {
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const messages = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: query },
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`OpenAI API Error ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '{}';
}

// ---- Main Handler ----------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
  const requestId = header(req, 'x-vercel-id') ?? header(req, 'x-request-id') ?? 'local';

  logEvent('info', { event: 'agent_start', method: req.method, requestId });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    logEvent('info', { event: 'agent_method_not_allowed', method: req.method, requestId, durationMs: Date.now() - t0 });
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    logEvent('error', { event: 'agent_not_configured', requestId, durationMs: Date.now() - t0 });
    res.status(503).json({ error: 'LLM not configured. Deterministic fallback required.' });
    return;
  }

  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    logEvent('info', { event: 'agent_bad_body', requestId, durationMs: Date.now() - t0 });
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const { query, context, history } = req.body as {
    query?: unknown;
    context?: unknown;
    history?: unknown;
  };
  if (!query || typeof query !== 'string' || query.length > 500) {
    logEvent('info', { event: 'agent_bad_query', requestId, durationMs: Date.now() - t0 });
    res.status(400).json({ error: 'Missing or invalid query (max 500 chars)' });
    return;
  }

  const safeHistory = sanitizeConversationHistory(history);

  let contextSize = 0;
  try {
    contextSize = JSON.stringify(context || {}).length;
  } catch {
    logEvent('info', { event: 'agent_bad_context', requestId, durationMs: Date.now() - t0 });
    res.status(400).json({ error: 'Invalid context payload' });
    return;
  }
  if (contextSize > 10000) {
    logEvent('info', { event: 'agent_context_too_large', requestId, contextSize, durationMs: Date.now() - t0 });
    res.status(400).json({ error: 'Context payload too large' });
    return;
  }

  try {
    let content: string;

    if (geminiKey) {
      content = await callGemini(geminiKey, query, context, safeHistory);
    } else {
      content = await callOpenAI(openaiKey!, query, context, safeHistory);
    }

    content = content.trim();
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(content);
    const validatedData = ResponseSchema.parse(parsed);

    logEvent('info', {
      event: 'agent_success',
      intent: validatedData.intent,
      provider: geminiKey ? 'gemini' : 'openai',
      historyTurns: safeHistory.length,
      requestId,
      durationMs: Date.now() - t0,
    });

    res.status(200).json(validatedData);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      logEvent('error', {
        event: 'agent_schema_error',
        issues: err.issues.map((i) => i.message).slice(0, 5),
        requestId,
        durationMs: Date.now() - t0,
      });
      res.status(500).json({ error: 'invalid_schema' });
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      logEvent('error', {
        event: 'agent_provider_error',
        error: msg.slice(0, 200),
        provider: geminiKey ? 'gemini' : 'openai',
        requestId,
        durationMs: Date.now() - t0,
      });
      res.status(503).json({ error: 'provider_unavailable' });
    }
  }
}
