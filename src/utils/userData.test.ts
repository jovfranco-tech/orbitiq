import { describe, expect, it } from 'vitest';
import { validateUserExportData } from './userData';

const baseExport = {
  version: '1.0.0',
  exportedAt: 1700000000000,
  watchlists: [],
  savedViews: [],
  snapshots: [],
};

describe('validateUserExportData', () => {
  it('accepts a minimal valid export payload', () => {
    expect(validateUserExportData(baseExport)).toMatchObject(baseExport);
  });

  it('rejects oversized user data payloads', () => {
    expect(() => validateUserExportData({
      ...baseExport,
      watchlists: Array.from({ length: 501 }, () => ({
        name: 'ISS',
        satnum: 25544,
        group: 'stations',
        band: 'LEO',
        alt: 420,
        region: 'global',
        sourceMode: 'fallback',
        addedAt: 1700000000000,
      })),
    })).toThrow(/limits/i);
  });

  it('clamps simulation offsets and strips rich snapshot objects', () => {
    const parsed = validateUserExportData({
      ...baseExport,
      snapshots: [{
        id: 'snap-1',
        timestamp: 1700000000000,
        simOffsetMs: 9999999999,
        sourceMode: 'fallback',
        totalLoaded: 100,
        visibleCount: 80,
        mostCrowdedBand: 'LEO',
        highestConcentrationRegion: 'LATAM',
        dominantGroup: 'starlink',
        selectedSatellite: { name: 'ISS' },
        executiveBrief: { headline: 'x' },
        caveats: ['a'],
      }],
    });

    expect(parsed.snapshots[0].simOffsetMs).toBe(604800000);
    expect(parsed.snapshots[0].selectedSatellite).toBeNull();
    expect(parsed.snapshots[0].executiveBrief).toBeNull();
  });
});
