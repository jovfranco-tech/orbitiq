import { describe, it, expect, beforeEach } from 'vitest';
import { CS, initCatalogStore } from '../state/catalogStore';
import { getMissionScenarios, invalidateRisk } from './risk';
import { invalidateIntelligence } from './intelligence';

function populateTestCatalog() {
  initCatalogStore(8);
  // GNSS / MEO
  CS.lat[0] = 20.0; CS.lon[0] = 50.0;  CS.alt[0] = 20200; CS.band[0] = 'MEO'; CS.group[0] = 'gnss';
  CS.lat[1] = -10;  CS.lon[1] = 100.0; CS.alt[1] = 19100; CS.band[1] = 'MEO'; CS.group[1] = 'gnss';
  // Starlink LEO over LATAM (lat/lon inside the latam box)
  CS.lat[2] = -15;  CS.lon[2] = -60;   CS.alt[2] = 550;   CS.band[2] = 'LEO'; CS.group[2] = 'starlink';
  CS.lat[3] = -23;  CS.lon[3] = -55;   CS.alt[3] = 560;   CS.band[3] = 'LEO'; CS.group[3] = 'starlink';
  // GEO comms
  CS.lat[4] = 0.0;  CS.lon[4] = -70;   CS.alt[4] = 35786; CS.band[4] = 'GEO'; CS.group[4] = 'geo';
  // Weather LEO
  CS.lat[5] = 45;   CS.lon[5] = 10;    CS.alt[5] = 820;   CS.band[5] = 'LEO'; CS.group[5] = 'weather';
  // Science LEO
  CS.lat[6] = 30;   CS.lon[6] = 120;   CS.alt[6] = 700;   CS.band[6] = 'LEO'; CS.group[6] = 'science';
  // Below-horizon record (alt < 0) must be ignored by counts
  CS.lat[7] = 0;    CS.lon[7] = 0;     CS.alt[7] = -1;    CS.band[7] = 'LEO'; CS.group[7] = 'leo';
}

describe('getMissionScenarios', () => {
  beforeEach(() => {
    populateTestCatalog();
    invalidateRisk();
    invalidateIntelligence();
    CS.liveSnapshot = null;
  });

  it('returns an empty map when the catalog is empty', () => {
    initCatalogStore(0);
    invalidateRisk();
    expect(getMissionScenarios('en')).toEqual({});
  });

  it('produces all six mission scenarios', () => {
    const scenarios = getMissionScenarios('en');
    expect(Object.keys(scenarios).sort()).toEqual([
      'Disaster_Response',
      'Executive_Snapshot',
      'GNSS_Dependency',
      'LATAM_Connectivity',
      'LEO_Density',
      'Weather_Visibility',
    ]);
  });

  it('counts GNSS satellites and ignores below-horizon records', () => {
    const { GNSS_Dependency } = getMissionScenarios('en');
    expect(GNSS_Dependency.visibleCount).toBe(2);
    expect(GNSS_Dependency.relevantBands).toEqual(['MEO']);
  });

  it('counts LATAM comms assets via region bounding box', () => {
    const { LATAM_Connectivity } = getMissionScenarios('en');
    // 2 starlink + 1 GEO over the LATAM box
    expect(LATAM_Connectivity.visibleCount).toBe(3);
    expect(LATAM_Connectivity.relevantRegions).toEqual(['latam']);
  });

  it('Executive_Snapshot reports the full visible catalog size', () => {
    const { Executive_Snapshot } = getMissionScenarios('en');
    expect(Executive_Snapshot.visibleCount).toBe(CS.N);
  });

  it('each scenario carries a risk level in the valid enum (when present)', () => {
    const scenarios = getMissionScenarios('en');
    for (const s of Object.values(scenarios)) {
      if (s.riskSignal) {
        expect(['low', 'moderate', 'elevated', 'high']).toContain(s.riskSignal.level);
        expect(s.riskSignal.score).toBeGreaterThanOrEqual(0);
        expect(s.riskSignal.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('localizes scenario titles to Spanish', () => {
    const { GNSS_Dependency } = getMissionScenarios('es');
    expect(GNSS_Dependency.title).toBe('Informe de Dependencia GNSS');
  });

  it('caches results within the TTL window', () => {
    const first = getMissionScenarios('en');
    const second = getMissionScenarios('en');
    expect(second).toBe(first); // same object reference = cache hit
  });

  it('invalidateRisk forces a fresh computation', () => {
    const first = getMissionScenarios('en');
    invalidateRisk();
    const second = getMissionScenarios('en');
    expect(second).not.toBe(first);
  });

  it('injects a simulated-scenario note when liveSnapshot is set', () => {
    CS.liveSnapshot = {
      total: 9000,
      bands: { LEO: 5000, MEO: 100, GEO: 50 },
      topRegion: 'latam',
      topGroup: 'starlink',
      selectedPos: null,
    };
    invalidateRisk();
    const { Executive_Snapshot } = getMissionScenarios('en');
    expect(Executive_Snapshot.insight).toContain('SIMULATED SCENARIO ACTIVE');
  });
});
