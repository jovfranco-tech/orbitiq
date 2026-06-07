import { describe, expect, it } from 'vitest';
import handler from '../../api/health';

function createResponse() {
  const result = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
    ended: false,
  };

  return {
    result,
    res: {
      setHeader(key: string, value: string) {
        result.headers[key] = value;
        return this;
      },
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(data: unknown) {
        result.body = data;
      },
      end() {
        result.ended = true;
      },
    },
  };
}

describe('/api/health', () => {
  it('returns a non-secret health summary', () => {
    const { res, result } = createResponse();

    handler({ method: 'GET', headers: { 'x-request-id': 'test' } }, res);

    expect(result.statusCode).toBe(200);
    expect(result.headers['Cache-Control']).toBe('no-store');
    expect(result.body).toMatchObject({
      status: 'ok',
      service: 'orbitiq',
      checks: {
        tleApi: 'configured',
        analytics: 'client',
      },
    });
    expect(JSON.stringify(result.body)).not.toContain('API_KEY');
  });

  it('rejects non-GET methods', () => {
    const { res, result } = createResponse();

    handler({ method: 'POST', headers: {} }, res);

    expect(result.statusCode).toBe(405);
    expect(result.body).toEqual({ error: 'Method not allowed' });
  });
});
