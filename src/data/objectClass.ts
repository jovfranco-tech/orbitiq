// ============================================================
// OrbitIQ — orbital object taxonomy
//
// A normalized object-class layer that sits ALONGSIDE the existing
// constellation/orbit `group` classifier. The product principle:
// OrbitIQ must not pretend that operational satellites, inactive
// payloads, rocket bodies and debris are the same thing.
//
// Classification is heuristic, derived from the public TLE object
// name (CelesTrak / Space-Track naming conventions encode object
// class: "... DEB" = debris fragment, "... R/B" = rocket body).
// When an authoritative OBJECT_TYPE field is available server-side
// (e.g. an optional Space-Track feed) it should take precedence —
// this module is the honest fallback that works with public data only.
// ============================================================
import type { ObjectClass, GroupKey } from '../types';

export interface ObjectClassMeta {
  /** i18n key for the human label */
  labelKey: string;
  /** Hex color used for the expanded / debris-risk visual language */
  color: string;
  /** True when the object represents active infrastructure (not debris/RB/inactive) */
  operational: boolean;
  /** Relative point size multiplier in the globe (debris is small & dim) */
  sizeScale: number;
}

export const OBJECT_CLASS_META: Record<ObjectClass, ObjectClassMeta> = {
  operational_satellite: { labelKey: 'class_operational_satellite', color: '#4cc9f0', operational: true,  sizeScale: 1.0 },
  active_payload:        { labelKey: 'class_active_payload',        color: '#5b9bd5', operational: true,  sizeScale: 0.95 },
  inactive_payload:      { labelKey: 'class_inactive_payload',      color: '#8b86b8', operational: false, sizeScale: 0.85 },
  rocket_body:           { labelKey: 'class_rocket_body',           color: '#e8963d', operational: false, sizeScale: 0.9 },
  debris:                { labelKey: 'class_debris',                color: '#ff4d6d', operational: false, sizeScale: 0.7 },
  unknown_object:        { labelKey: 'class_unknown_object',        color: '#8d99ae', operational: false, sizeScale: 0.75 },
};

/** Render / legend order: operational infrastructure first, debris last. */
export const OBJECT_CLASS_ORDER: ObjectClass[] = [
  'operational_satellite',
  'active_payload',
  'inactive_payload',
  'rocket_body',
  'debris',
  'unknown_object',
];

/** Groups treated as recognised, flagship operational infrastructure. */
const OPERATIONAL_GROUPS = new Set<GroupKey>(['starlink', 'gnss', 'stations', 'weather', 'science']);

const DEBRIS_RE = /\bDEB\b|DEBRIS|\bFRAG|COOLANT|WESTFORD|NEEDLES|SHRAPNEL/;
const ROCKET_BODY_RE = /R\/B|ROCKET BODY|\bAKM\b|\bPKM\b|BREEZE|CENTAUR|\bSL-\d|ULLAGE|\bH-2A\b|\bDPAF\b/;
const INACTIVE_RE = /\bINOP\b|INACTIVE|\bDECAY|NONOP|\bDEAD\b|\bRETIRED\b/;
const UNKNOWN_RE = /\bTBA\b|UNKNOWN|UNIDENTIFIED|\bANALYST\b/;

/**
 * Classify an orbital object into a normalized class from its public name.
 * `group` and `isReal` refine the payload split (operational vs generic active).
 */
export function classifyObjectClass(name: string, group: GroupKey, isReal = true): ObjectClass {
  const u = (name || '').toUpperCase();

  if (DEBRIS_RE.test(u)) return 'debris';
  if (ROCKET_BODY_RE.test(u)) return 'rocket_body';
  if (INACTIVE_RE.test(u)) return 'inactive_payload';
  if (UNKNOWN_RE.test(u)) return 'unknown_object';

  // Remaining objects are payloads. Split into recognised operational
  // infrastructure vs generic active payloads so metrics can be honest.
  if (OPERATIONAL_GROUPS.has(group)) return 'operational_satellite';
  return isReal ? 'active_payload' : 'active_payload';
}

/** True for active infrastructure (operational satellites + active payloads). */
export function isOperationalClass(cls: ObjectClass): boolean {
  return cls === 'operational_satellite' || cls === 'active_payload';
}

/** True for non-operational tracked objects (debris, rocket bodies, inactive, unknown). */
export function isNonOperationalClass(cls: ObjectClass): boolean {
  return !isOperationalClass(cls);
}

export interface ClassCounts {
  operationalCount: number;
  activePayloadCount: number;
  inactivePayloadCount: number;
  rocketBodyCount: number;
  debrisCount: number;
  unknownCount: number;
  totalObjects: number;
}

/** Tally a list of object classes into the metadata count shape. */
export function tallyClasses(classes: ObjectClass[]): ClassCounts {
  const counts: ClassCounts = {
    operationalCount: 0,
    activePayloadCount: 0,
    inactivePayloadCount: 0,
    rocketBodyCount: 0,
    debrisCount: 0,
    unknownCount: 0,
    totalObjects: classes.length,
  };
  for (const c of classes) {
    switch (c) {
      case 'operational_satellite': counts.operationalCount++; break;
      case 'active_payload': counts.activePayloadCount++; break;
      case 'inactive_payload': counts.inactivePayloadCount++; break;
      case 'rocket_body': counts.rocketBodyCount++; break;
      case 'debris': counts.debrisCount++; break;
      case 'unknown_object': counts.unknownCount++; break;
    }
  }
  return counts;
}
