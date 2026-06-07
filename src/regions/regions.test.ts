import { describe, it, expect } from 'vitest';
import { matchRegion, regionOf, REGIONS } from './regions';

describe('matchRegion', () => {
  it('matches Japan for Tokyo coordinates', () => {
    expect(matchRegion(35.6, 139.7, 'japan')).toBe(true);
    expect(matchRegion(36, 138, 'japan')).toBe(true);
  });

  it('rejects non-Japan coordinates for japan key', () => {
    expect(matchRegion(51.5, -0.1, 'japan')).toBe(false); // London
    expect(matchRegion(-33.8, 151.2, 'japan')).toBe(false); // Sydney
    expect(matchRegion(40.7, -74, 'japan')).toBe(false); // New York
  });

  it('matches USA for American cities', () => {
    expect(matchRegion(40.7, -74, 'usa')).toBe(true);   // New York
    expect(matchRegion(34, -118, 'usa')).toBe(true);     // Los Angeles
    expect(matchRegion(39, -98, 'usa')).toBe(true);      // Geographic center
  });

  it('matches Europe for European capitals', () => {
    expect(matchRegion(51.5, -0.1, 'europe')).toBe(true);  // London
    expect(matchRegion(48.8, 2.3, 'europe')).toBe(true);   // Paris
    expect(matchRegion(52.5, 13.4, 'europe')).toBe(true);  // Berlin
  });

  it('matches equatorial belt for low-latitude coordinates', () => {
    expect(matchRegion(0, 0, 'equator')).toBe(true);
    expect(matchRegion(9, 45, 'equator')).toBe(true);
    expect(matchRegion(-9, -45, 'equator')).toBe(true);
  });

  it('rejects equatorial belt for high-latitude coordinates', () => {
    expect(matchRegion(15, 0, 'equator')).toBe(false);
    expect(matchRegion(-15, 0, 'equator')).toBe(false);
  });

  it('matches arctic for high latitudes', () => {
    expect(matchRegion(78, 0, 'arctic')).toBe(true);
    expect(matchRegion(90, 0, 'arctic')).toBe(true);
    expect(matchRegion(70, 180, 'arctic')).toBe(true);
  });

  it('returns false for unknown region key', () => {
    expect(matchRegion(45, 90, 'nonexistent')).toBe(false);
    expect(matchRegion(0, 0, '')).toBe(false);
  });
});

describe('regionOf', () => {
  it('returns a non-empty string for any coordinate', () => {
    expect(regionOf(35.6, 139.7)).toBeTruthy(); // Tokyo
    expect(regionOf(51.5, -0.1)).toBeTruthy();  // London
    expect(regionOf(40.7, -74)).toBeTruthy();   // New York
    expect(regionOf(-90, 0)).toBeTruthy();       // South Pole
  });

  it('handles polar coordinates', () => {
    const northPole = regionOf(90, 0);
    expect(typeof northPole).toBe('string');
    expect(northPole.length).toBeGreaterThan(0);
  });

  it('handles equatorial ocean coordinates not in any named region', () => {
    // Mid-Atlantic near equator — not inside any named land region
    const result = regionOf(2, -30);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('REGIONS constant', () => {
  it('contains all expected region keys', () => {
    const keys = Object.keys(REGIONS);
    expect(keys).toContain('japan');
    expect(keys).toContain('europe');
    expect(keys).toContain('usa');
    expect(keys).toContain('arctic');
    expect(keys).toContain('equator');
    expect(keys).toContain('africa');
    expect(keys).toContain('latam');
    expect(keys).toContain('middle_east');
  });

  it('each region has valid box coordinates', () => {
    for (const [, region] of Object.entries(REGIONS)) {
      expect(region.box).toHaveLength(4);
      const [latMin, latMax, , ] = region.box;
      expect(latMin).toBeGreaterThanOrEqual(-90);
      expect(latMax).toBeLessThanOrEqual(90);
      expect(latMin).toBeLessThan(latMax);
    }
  });
});
