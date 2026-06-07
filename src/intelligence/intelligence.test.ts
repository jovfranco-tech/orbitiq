import { describe, it, expect, beforeEach } from 'vitest';
import { CS, initCatalogStore } from '../state/catalogStore';
import {
  getIntelligence, invalidateIntelligence,
  compareBands, compareGroups, getConstellationIntelligence,
} from './intelligence';

function populateTestCatalog() {
  initCatalogStore(6);
  // 3 LEO Starlink satellites over distinct regions
  CS.lat[0] = 35.6; CS.lon[0] = 139.7; CS.alt[0] = 550;  CS.band[0] = 'LEO'; CS.group[0] = 'starlink';
  CS.lat[1] = 40.7; CS.lon[1] = -74.0; CS.alt[1] = 560;  CS.band[1] = 'LEO'; CS.group[1] = 'starlink';
  CS.lat[2] = 51.5; CS.lon[2] = -0.1;  CS.alt[2] = 540;  CS.band[2] = 'LEO'; CS.group[2] = 'leo';
  // 2 MEO GNSS satellites
  CS.lat[3] = 20.0; CS.lon[3] = 50.0;  CS.alt[3] = 20200; CS.band[3] = 'MEO'; CS.group[3] = 'gnss';
  CS.lat[4] = -10;  CS.lon[4] = 100.0; CS.alt[4] = 19100; CS.band[4] = 'MEO'; CS.group[4] = 'gnss';
  // 1 GEO satellite at equatorial belt
  CS.lat[5] = 0.0;  CS.lon[5] = 0.0;   CS.alt[5] = 35786; CS.band[5] = 'GEO'; CS.group[5] = 'geo';
}

describe('getIntelligence', () => {
  beforeEach(() => {
    populateTestCatalog();
    invalidateIntelligence();
  });

  it('returns a valid IntelligenceSummary structure', () => {
    const intel = getIntelligence(true);
    expect(intel).toHaveProperty('bands');
    expect(intel).toHaveProperty('mostCrowdedBand');
    expect(intel).toHaveProperty('regions');
    expect(intel).toHaveProperty('highestConcentrationRegion');
    expect(intel).toHaveProperty('dominantGroup');
    expect(intel).toHaveProperty('congestionScore');
    expect(intel).toHaveProperty('congestionLevel');
    expect(intel).toHaveProperty('timestamp');
  });

  it('identifies LEO as the most crowded band (3 out of 6 satellites)', () => {
    expect(getIntelligence(true).mostCrowdedBand).toBe('LEO');
  });

  it('identifies starlink as the dominant group (2 out of 6)', () => {
    expect(getIntelligence(true).dominantGroup).toBe('starlink');
  });

  it('congestion score is within [0, 100]', () => {
    const score = getIntelligence(true).congestionScore;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('congestion level is a valid enum value', () => {
    const level = getIntelligence(true).congestionLevel;
    expect(['low', 'moderate', 'elevated', 'high']).toContain(level);
  });

  it('bands array contains LEO, MEO, and GEO entries', () => {
    const bands = getIntelligence(true).bands;
    const bandNames = bands.map((b) => b.band);
    expect(bandNames).toContain('LEO');
    expect(bandNames).toContain('MEO');
    expect(bandNames).toContain('GEO');
  });

  it('band percentages sum to approximately 100', () => {
    const bands = getIntelligence(true).bands;
    const total = bands.reduce((s, b) => s + b.pct, 0);
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it('caches results and returns the same reference within TTL', () => {
    const first = getIntelligence(true);
    const second = getIntelligence(false);
    expect(second).toBe(first);
  });

  it('recomputes a new object after invalidation', () => {
    const first = getIntelligence(true);
    invalidateIntelligence();
    const second = getIntelligence(true);
    expect(second).not.toBe(first);
  });

  it('returns zero congestion score for empty catalog', () => {
    initCatalogStore(0);
    invalidateIntelligence();
    const intel = getIntelligence(true);
    expect(intel.congestionScore).toBe(0);
  });
});

describe('compareBands', () => {
  beforeEach(() => {
    populateTestCatalog();
    invalidateIntelligence();
  });

  it('returns a non-empty English string for LEO vs GEO', () => {
    const result = compareBands('LEO', 'GEO', 'en');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(10);
    expect(result).toContain('LEO');
    expect(result).toContain('GEO');
  });

  it('returns Spanish text when lang=es', () => {
    const result = compareBands('LEO', 'MEO', 'es');
    expect(result).toContain('LEO');
    expect(result).toContain('MEO');
    expect(result).toMatch(/objetos|altitud/);
  });

  it('identifies LEO as having more objects in the test catalog', () => {
    const result = compareBands('LEO', 'GEO', 'en');
    expect(result).toContain('LEO has more objects');
  });

  it('includes average altitude in the output', () => {
    const result = compareBands('LEO', 'MEO', 'en');
    expect(result).toMatch(/avg altitude|altitud promedio/);
  });
});

describe('compareGroups', () => {
  beforeEach(() => {
    populateTestCatalog();
    invalidateIntelligence();
  });

  it('returns a comparison string mentioning both group labels', () => {
    const result = compareGroups('starlink', 'gnss', 'en');
    expect(typeof result).toBe('string');
    expect(result).toContain('Starlink');
    expect(result).toContain('GNSS');
  });

  it('returns Spanish text for lang=es', () => {
    const result = compareGroups('starlink', 'geo', 'es');
    expect(result).toMatch(/objetos|altitud|región/);
  });

  it('includes object counts and average altitudes', () => {
    const result = compareGroups('starlink', 'gnss', 'en');
    expect(result).toMatch(/objects|km/);
  });
});

describe('getConstellationIntelligence', () => {
  beforeEach(() => {
    populateTestCatalog();
    invalidateIntelligence();
  });

  it('returns correct count for starlink group', () => {
    const ci = getConstellationIntelligence('starlink', 'en');
    expect(ci.group).toBe('starlink');
    expect(ci.count).toBe(2);
    expect(ci.dominantBand).toBe('LEO');
  });

  it('returns correct count for gnss group', () => {
    const ci = getConstellationIntelligence('gnss', 'en');
    expect(ci.count).toBe(2);
    expect(ci.dominantBand).toBe('MEO');
  });

  it('returns zero count for group with no satellites', () => {
    const ci = getConstellationIntelligence('stations', 'en');
    expect(ci.count).toBe(0);
  });

  it('includes a relevance string', () => {
    const ci = getConstellationIntelligence('starlink', 'en');
    expect(typeof ci.relevance).toBe('string');
    expect(ci.relevance.length).toBeGreaterThan(0);
  });
});
