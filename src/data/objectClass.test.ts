import { describe, it, expect } from 'vitest';
import {
  classifyObjectClass,
  isOperationalClass,
  isNonOperationalClass,
  tallyClasses,
  OBJECT_CLASS_META,
  OBJECT_CLASS_ORDER,
} from './objectClass';
import type { ObjectClass } from '../types';

describe('classifyObjectClass', () => {
  it('classifies debris from "DEB" / "DEBRIS" names', () => {
    expect(classifyObjectClass('COSMOS 1408 DEB', 'other')).toBe('debris');
    expect(classifyObjectClass('FENGYUN 1C DEBRIS', 'other')).toBe('debris');
    expect(classifyObjectClass('SL-16 R/B COOLANT', 'other')).toBe('debris');
  });

  it('classifies rocket bodies from "R/B" and known stage names', () => {
    expect(classifyObjectClass('SL-4 R/B', 'other')).toBe('rocket_body');
    expect(classifyObjectClass('ATLAS 5 CENTAUR R/B', 'other')).toBe('rocket_body');
    expect(classifyObjectClass('FALCON 9 ROCKET BODY', 'other')).toBe('rocket_body');
  });

  it('classifies inactive payloads', () => {
    expect(classifyObjectClass('OLD SAT (INOP)', 'leo')).toBe('inactive_payload');
    expect(classifyObjectClass('DEAD COMSAT', 'geo')).toBe('inactive_payload');
  });

  it('classifies unknown / analyst objects', () => {
    expect(classifyObjectClass('TBA - TO BE ASSIGNED', 'other')).toBe('unknown_object');
    expect(classifyObjectClass('UNKNOWN', 'other')).toBe('unknown_object');
  });

  it('classifies recognised constellations as operational satellites', () => {
    expect(classifyObjectClass('STARLINK-1234', 'starlink')).toBe('operational_satellite');
    expect(classifyObjectClass('GPS BIIF-2', 'gnss')).toBe('operational_satellite');
    expect(classifyObjectClass('ISS (ZARYA)', 'stations')).toBe('operational_satellite');
  });

  it('classifies generic active objects as active payloads', () => {
    expect(classifyObjectClass('SOME LEO SAT', 'leo')).toBe('active_payload');
    expect(classifyObjectClass('GENERIC OBJECT 12', 'other')).toBe('active_payload');
  });

  it('is case-insensitive and null-safe', () => {
    expect(classifyObjectClass('cosmos deb', 'other')).toBe('debris');
    expect(classifyObjectClass('', 'leo')).toBe('active_payload');
  });
});

describe('isOperationalClass / isNonOperationalClass', () => {
  it('treats payloads as operational and the rest as non-operational', () => {
    expect(isOperationalClass('operational_satellite')).toBe(true);
    expect(isOperationalClass('active_payload')).toBe(true);
    expect(isOperationalClass('debris')).toBe(false);
    expect(isNonOperationalClass('rocket_body')).toBe(true);
    expect(isNonOperationalClass('debris')).toBe(true);
    expect(isNonOperationalClass('operational_satellite')).toBe(false);
  });
});

describe('tallyClasses', () => {
  it('counts each class and the total', () => {
    const classes: ObjectClass[] = [
      'operational_satellite', 'operational_satellite', 'active_payload',
      'rocket_body', 'debris', 'debris', 'inactive_payload', 'unknown_object',
    ];
    const c = tallyClasses(classes);
    expect(c.operationalCount).toBe(2);
    expect(c.activePayloadCount).toBe(1);
    expect(c.rocketBodyCount).toBe(1);
    expect(c.debrisCount).toBe(2);
    expect(c.inactivePayloadCount).toBe(1);
    expect(c.unknownCount).toBe(1);
    expect(c.totalObjects).toBe(8);
  });

  it('returns zeros for an empty list', () => {
    const c = tallyClasses([]);
    expect(c.totalObjects).toBe(0);
    expect(c.debrisCount).toBe(0);
  });
});

describe('metadata tables', () => {
  it('defines meta + a stable order for every class', () => {
    expect(OBJECT_CLASS_ORDER).toHaveLength(6);
    for (const cls of OBJECT_CLASS_ORDER) {
      const m = OBJECT_CLASS_META[cls];
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof m.labelKey).toBe('string');
      expect(m.sizeScale).toBeGreaterThan(0);
    }
    // operational classes flagged operational, others not
    expect(OBJECT_CLASS_META.operational_satellite.operational).toBe(true);
    expect(OBJECT_CLASS_META.debris.operational).toBe(false);
  });
});
