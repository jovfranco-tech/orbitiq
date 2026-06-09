import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { UserConfig } from 'vite';
import { resolve } from 'path';

// ---- Dev API middleware: serves /api/agent locally with the same logic ------
function devApiPlugin(env: Record<string, string>) {
  return {
    name: 'dev-api-agent',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: any, res: any) => void) => void } }) {
      server.middlewares.use('/api/agent', (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
          res.writeHead(204); res.end(); return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405); res.end(JSON.stringify({ error: 'Method not allowed' })); return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const { query, context } = body as { query?: string; context?: unknown };

            if (!query || typeof query !== 'string') {
              res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid query' })); return;
            }

            const geminiKey = env.GEMINI_API_KEY;
            const openaiKey = env.OPENAI_API_KEY;

            if (!geminiKey && !openaiKey) {
              res.writeHead(503);
              res.end(JSON.stringify({ error: 'LLM not configured' }));
              return;
            }

            const systemPrompt = buildDevSystemPrompt(context);
            let content: string;

            if (geminiKey) {
              const model = env.GEMINI_MODEL || 'gemini-2.0-flash';
              const aiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: query }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 2048 },
                  }),
                }
              );
              if (!aiRes.ok) throw new Error(`Gemini ${aiRes.status}`);
              const json = await aiRes.json();
              content = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            } else {
              const model = env.LLM_MODEL || 'gpt-4o-mini';
              const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
                body: JSON.stringify({
                  model,
                  messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: query }],
                  temperature: 0.1,
                  response_format: { type: 'json_object' },
                }),
              });
              if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}`);
              const json = await aiRes.json();
              content = json.choices?.[0]?.message?.content || '{}';
            }

            content = content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
            res.writeHead(200);
            res.end(content);
          } catch (e) {
            console.error('[dev-api/agent]', e);
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'provider_unavailable' }));
          }
        });
      });
    },
  };
}

function buildDevSystemPrompt(context: unknown): string {
  return `You are OrbitIQ AI Command Agent, an orbital intelligence assistant.
Return ONLY valid JSON. No markdown. No preamble.
Available Context: ${JSON.stringify(context)}

Respond with this exact JSON shape:
{
  "answer": string,
  "intent": string,
  "confidence": number (0-1),
  "assumptions": string[],
  "actions": Array<{ type: string, [key: string]: unknown }>,
  "filtersApplied": Record<string, unknown>,
  "visibleCount": number,
  "sourceMode": "live" | "cached" | "fallback" | "mixed",
  "safetyCaveat": string,
  "language": "en" | "es"
}

Valid action types: filter_by_group, filter_by_region, filter_by_band, altitude_threshold, find_satellite,
compare_bands, compare_groups, congestion_summary, executive_brief, generate_mission_brief,
select_mission_scenario, show_risk_layer, highlight_relevant_groups, highlight_relevant_region,
recommend_next_view, reset_view, set_time_mode, set_time_speed, jump_time, reset_to_now,
pause_simulation, resume_simulation, add_to_watchlist, remove_from_watchlist, show_watchlist,
save_current_view, load_saved_view, create_snapshot, export_snapshot, recommend_saved_view, unknown_safe_fallback.

The user query may be in English or Spanish. Respond in the same language.
Never claim operational authority. Always include a safety caveat.`;
}

// ---------------------------------------------------------------------------

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      devApiPlugin(env),
    ],
    worker: {
      format: 'iife',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      target: 'es2020',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/three/examples/')) return 'three-examples';
            if (id.includes('/node_modules/three/')) return 'three';
            if (id.includes('/node_modules/satellite.js/')) return 'satellite';
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react';
          },
        },
      },
    },
    server: {
      port: 5173,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      exclude: ['e2e/**', 'node_modules/**'],
      setupFiles: ['src/test-setup.ts'],
      coverage: {
        provider: 'v8',
        // Coverage gate scopes the *pure-logic* layer (deterministic, unit-testable).
        // The React UI, the imperative WebGL renderer, the Web Worker, Firebase cloud
        // sync, and orchestration hooks/stores are validated by the Playwright e2e +
        // accessibility suites instead.
        include: [
          'src/data/**/*.ts',
          'src/intelligence/**/*.ts',
          'src/orbital/**/*.ts',
          'src/regions/**/*.ts',
          'src/i18n/**/*.ts',
          'src/utils/**/*.ts',
          'src/hooks/useKeyboardShortcuts.ts',
        ],
        // audio.ts is Web Audio synthesis — exercised in the browser, not unit-testable.
        exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/utils/audio.ts'],
        thresholds: {
          lines: 60,
          functions: 60,
          branches: 45,
        },
        reporter: ['text', 'lcov'],
      },
    },
  } as UserConfig;
});
