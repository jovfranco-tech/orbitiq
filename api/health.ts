interface VercelRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  setHeader(k: string, v: string): this;
  status(code: number): this;
  json(data: unknown): void;
  end(): void;
}

function header(req: VercelRequest, key: string): string | undefined {
  const value = req.headers?.[key] ?? req.headers?.[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function logEvent(level: 'info' | 'error', data: Record<string, unknown>): void {
  const payload = JSON.stringify({ level, route: '/api/health', ...data });
  if (level === 'error') console.error(payload);
  else console.log(payload);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const requestId = header(req, 'x-vercel-id') ?? header(req, 'x-request-id') ?? 'local';
  logEvent('info', { event: 'health_start', method: req.method, requestId });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    logEvent('info', { event: 'health_method_not_allowed', method: req.method, requestId, durationMs: Date.now() - startedAt });
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const llmConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  const payload = {
    status: 'ok',
    service: 'orbitiq',
    timestamp: new Date().toISOString(),
    checks: {
      tleApi: 'configured',
      llmAgent: llmConfigured ? 'configured' : 'fallback',
      analytics: 'client',
    },
  };

  logEvent('info', {
    event: 'health_success',
    requestId,
    llmConfigured,
    durationMs: Date.now() - startedAt,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(payload);
}
