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

  it('defaults to operational mode but always requests expanded dataset', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const result = await loadSatellites();
    expect(result.mode).toBe('operational');
    // v1.1.3: always requests expanded to load full dataset upfront
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('mode=expanded'), expect.anything());
  });

  it('requests expanded even when called with debris mode', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    await loadSatellites('debris');
    // v1.1.3: always requests expanded for full dataset
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('mode=expanded'), expect.anything());
  });

  it('always includes a representative debris layer in the fallback catalog', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const result = await loadSatellites('operational');
    // v1.1.3: fallback always includes full dataset (operational + debris)
    const debris = result.catalog.filter((c) => c.objectClass === 'debris');
    expect(debris.length).toBeGreaterThan(0);
    expect(debris.every((d) => d.isReal === false)).toBe(true);
    expect(result.meta?.debrisCount).toBeGreaterThan(0);
  });

  it('classifies real API records into object classes and counts them', async () => {
    const sats = [
      { name: 'STARLINK-1007', satnum: 44713, l1: '1 44713U', l2: '2 44713  53.0000', isReal: true },
      { name: 'COSMOS 1408 DEB', satnum: 90001, l1: '1 90001U', l2: '2 90001  82.6000', isReal: true },
      { name: 'SL-16 R/B', satnum: 90002, l1: '1 90002U', l2: '2 90002  71.0000', isReal: true },
    ];
    // pad to >100 so the count guard passes
    for (let i = 0; i < 110; i++) sats.push({ name: `LEOSAT ${i}`, satnum: 50000 + i, l1: '1 50000U', l2: '2 50000  53.0000', isReal: true });
    mockFetch.mockResolvedValue(jsonResponse({
      satellites: sats,
      meta: { dataMode: 'live', freshness: 'live', source: 'CelesTrak', fetchTimestamp: new Date().toISOString(), cacheTimestamp: new Date().toISOString(), count: sats.length },
    }));
    const result = await loadSatellites('expanded');
    expect(result.dataMode).toBe('live');
    expect(result.meta?.debrisCount).toBeGreaterThanOrEqual(1);
    expect(result.meta?.rocketBodyCount).toBeGreaterThanOrEqual(1);
    expect(result.catalog.find((c) => c.name === 'COSMOS 1408 DEB')?.objectClass).toBe('debris');
  });
});
