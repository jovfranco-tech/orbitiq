import { describe, expect, it } from 'vitest';
import { buildExecutiveBriefMarkdown, buildExecutiveSnapshotMarkdown } from './reports';
import type { ExecutiveSnapshot } from '../types';

describe('report markdown builders', () => {
  it('renders executive brief context and sections', () => {
    const markdown = buildExecutiveBriefMarkdown({
      generatedAt: Date.UTC(2026, 5, 7, 15, 0, 0),
      sourceMode: 'fallback',
      totalLoaded: 1912,
      visibleCount: 600,
      mostCrowdedBand: 'LEO',
      highestConcentrationRegion: 'latam',
      dominantGroup: 'starlink',
      congestionScore: 42,
      congestionLevel: 'moderate',
      caveats: ['Not for flight safety.'],
      brief: {
        headline: '600 of 1,912 tracked objects in view',
        sections: [
          { title: 'Key concentration', body: 'LEO is dominant.' },
          { title: 'Recommended next action', body: 'Open risk layer.' },
        ],
      },
    });

    expect(markdown).toContain('# OrbitIQ Executive Orbital Brief');
    expect(markdown).toContain('- Total Loaded: 1,912');
    expect(markdown).toContain('- Congestion: 42/100 (moderate)');
    expect(markdown).toContain('## Key concentration');
    expect(markdown).toContain('- Not for flight safety.');
  });

  it('renders saved snapshot details including selected target', () => {
    const snap: ExecutiveSnapshot = {
      id: 'snap-1',
      timestamp: Date.UTC(2026, 5, 7, 15, 0, 0),
      simOffsetMs: 0,
      sourceMode: 'live',
      totalLoaded: 2000,
      visibleCount: 1200,
      mostCrowdedBand: 'LEO',
      highestConcentrationRegion: 'japan',
      dominantGroup: 'gnss',
      selectedSatellite: {
        name: 'ISS',
        satnum: 25544,
        lat: 12.345,
        lon: -98.765,
        alt: 420,
      },
      executiveBrief: {
        headline: 'Current orbital picture',
        sections: [{ title: 'Context', body: 'Live SGP4 view.' }],
      },
      missionBrief: null,
      riskLayerSummary: null,
      caveats: ['Portfolio signal only.'],
    };

    const markdown = buildExecutiveSnapshotMarkdown(snap);

    expect(markdown).toContain('# OrbitIQ Executive Snapshot');
    expect(markdown).toContain('- NORAD: 25544');
    expect(markdown).toContain('- Subpoint: 12.35, -98.77');
    expect(markdown).toContain('### Context');
    expect(markdown).toContain('- Portfolio signal only.');
  });
});
