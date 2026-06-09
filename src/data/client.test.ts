import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadSatellites } from './client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, contentType = 'application/json') {
  return {
    ok: true,
    headers: { get: (key: string) => (key === 'content-type' ? contentType : null) },
    json: async () => body,
  };
}

describe('loadSatellites', () => {
  it('returns fallback catalog when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await loadSatellites();
    expect(result.dataMode).toBe('fallback');
    expect(result.catalog.length).toBeGreaterThan(0);
    expect(result.source).toBe('representative-catalog');
  });

  it('returns fallback catalog when API returns non-OK status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) });
    const result = await loadSatellites();
    expect(result.dataMode).toBe('fallback');
  });

  it('returns fallback when response has fewer than 100 satellites', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      satellites: [{ name: 'TEST-1', satnum: 1, l1: '1 00001U', l2: '2 00001', isReal: true }],
      meta: { dataMode: 'live', freshness: 'live', source: 'test', fetchTimestamp: new Date().toISOString(), cacheTimestamp: new Date().toISOString(), count: 1 },
    }));
    const result = await loadSatellites();
    expect(result.dataMode).toBe('fallback');
  });

  it('returns fallback when content-type is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      json: async () => ({}),
    });
    const result = await loadSatellites();
    expect(result.dataMode).toBe('fallback');
  });

  it('fallback catalog has a fetchedAt timestamp', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const result = await loadSatellites();
    expect(result.fetchedAt).toBeTruthy();
    expect(new Date(result.fetchedAt).getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});
