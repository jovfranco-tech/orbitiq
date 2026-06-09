import { describe, it, expect } from 'vitest';
import { buildCatalog, buildDebrisFallback } from './catalog';

describe('buildCatalog', () => {
  it('builds a deterministic representative catalog of valid TLE records', () => {
    const a = buildCatalog();
    const b = buildCatalog();
    expect(a.length).toBeGreaterThan(1000);
    expect(a.length).toBe(b.length); // deterministic
    const first = a[0];
    expect(first.l1.startsWith('1 ')).toBe(true);
    expect(first.l2.startsWith('2 ')).toBe(true);
    expect(typeof first.satnum).toBe('number');
  });
});

describe('buildDebrisFallback', () => {
  it('produces only non-operational, clearly-marked DEMO objects', () => {
    const debris = buildDebrisFallback();
    expect(debris.length).toBeGreaterThan(1000);
    // every record is synthetic (isReal false) and carries an object class
    expect(debris.every((d) => d.isReal === false)).toBe(true);
    expect(debris.every((d) => d.objectClass != null)).toBe(true);
    expect(debris.every((d) => /DEMO/.test(d.name))).toBe(true);
    // contains debris AND rocket bodies AND inactive payloads
    const classes = new Set(debris.map((d) => d.objectClass));
    expect(classes.has('debris')).toBe(true);
    expect(classes.has('rocket_body')).toBe(true);
    expect(classes.has('inactive_payload')).toBe(true);
  });

  it('uses a satnum range that does not collide with the operational fallback', () => {
    const ops = buildCatalog();
    const debris = buildDebrisFallback();
    const opMax = Math.max(...ops.map((s) => s.satnum));
    const debrisMin = Math.min(...debris.map((s) => s.satnum));
    expect(debrisMin).toBeGreaterThan(opMax);
  });
});
