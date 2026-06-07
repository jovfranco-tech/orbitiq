import { describe, it, expect } from 'vitest';
import { classifyGroup, bandFromAltitude } from './groups';

describe('classifyGroup', () => {
  it('classifies Starlink satellites', () => {
    expect(classifyGroup('STARLINK-1234', 550)).toBe('starlink');
    expect(classifyGroup('Starlink-5678', 550)).toBe('starlink');
  });

  it('classifies space stations', () => {
    expect(classifyGroup('ISS (ZARYA)', 400)).toBe('stations');
    expect(classifyGroup('TIANHE', 380)).toBe('stations');
    expect(classifyGroup('CSS (TIANHE)', 380)).toBe('stations');
    expect(classifyGroup('CREW DRAGON', 400)).toBe('stations');
  });

  it('classifies GNSS satellites', () => {
    expect(classifyGroup('GPS BIIR-5', 20200)).toBe('gnss');
    expect(classifyGroup('GALILEO-14', 23000)).toBe('gnss');
    expect(classifyGroup('GLONASS-M', 19100)).toBe('gnss');
    expect(classifyGroup('BEIDOU-3', 21500)).toBe('gnss');
    expect(classifyGroup('NAVSTAR 72', 20200)).toBe('gnss');
  });

  it('classifies weather satellites', () => {
    expect(classifyGroup('NOAA-18', 800)).toBe('weather');
    expect(classifyGroup('GOES-16', 35786)).toBe('weather');
    expect(classifyGroup('METOP-A', 817)).toBe('weather');
    expect(classifyGroup('FENGYUN-4A', 35786)).toBe('weather');
  });

  it('classifies science satellites', () => {
    expect(classifyGroup('HUBBLE', 540)).toBe('science');
    expect(classifyGroup('LANDSAT-9', 700)).toBe('science');
    expect(classifyGroup('SENTINEL-2A', 786)).toBe('science');
  });

  it('classifies by altitude when name is unrecognized', () => {
    expect(classifyGroup('RANDOM-SAT', 500)).toBe('leo');
    expect(classifyGroup('MYSTERY-SAT', 10000)).toBe('meo');
    expect(classifyGroup('UNKNOWN-SAT', 36000)).toBe('geo');
    expect(classifyGroup('HIGH-SAT', 42000)).toBe('geo');
  });
});

describe('bandFromAltitude', () => {
  it('returns LEO for altitudes below 2000 km', () => {
    expect(bandFromAltitude(0)).toBe('LEO');
    expect(bandFromAltitude(400)).toBe('LEO');
    expect(bandFromAltitude(1999)).toBe('LEO');
  });

  it('returns MEO for altitudes between 2000 and 35000 km', () => {
    expect(bandFromAltitude(2000)).toBe('MEO');
    expect(bandFromAltitude(20200)).toBe('MEO');
    expect(bandFromAltitude(34999)).toBe('MEO');
  });

  it('returns GEO for altitudes at or above 35000 km', () => {
    expect(bandFromAltitude(35000)).toBe('GEO');
    expect(bandFromAltitude(35786)).toBe('GEO');
    expect(bandFromAltitude(42164)).toBe('GEO');
  });
});
