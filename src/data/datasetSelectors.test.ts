// ============================================================
// OrbitIQ — Dataset Selectors Tests (v1.1.3)
// Validates the single-source-of-truth dataset architecture.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { buildCatalog, buildDebrisFallback } from './catalog';
import { classifyGroup } from './groups';
import { classifyObjectClass, isOperationalClass } from './objectClass';
import { CS, initCatalogStore } from '../state/catalogStore';
import {
  getOperationalIndices,
  getRiskOverlayIndices,
  getExpandedIndices,
  getDebrisRiskIndices,
  getModeBaseIndices,
  getModeTotal,
  getModeCounters,
  validateDatasets,
} from './datasetSelectors';
import type { SatelliteRecord, ObjectClass } from '../types';

// Build a combined catalog simulating what client.ts does on startup
function buildFullCatalog(): SatelliteRecord[] {
  const base = buildCatalog();
  const debris = buildDebrisFallback();
  // Enrich with objectClass
  const enrich = (s: SatelliteRecord): SatelliteRecord => {
    const group = s.group ?? classifyGroup(s.name, s.altNominal ?? 600);
    return { ...s, group, objectClass: s.objectClass ?? classifyObjectClass(s.name, group, s.isReal) };
  };
  return [...base.map(enrich), ...debris.map(enrich)];
}

// Initialize CS with the full catalog for testing
function initTestCatalog() {
  const catalog = buildFullCatalog();
  CS.catalog = catalog;
  initCatalogStore(catalog.length);
  for (let i = 0; i < CS.N; i++) {
    const rec = catalog[i];
    CS.group[i] = rec.group;
    CS.objectClass[i] = rec.objectClass ?? classifyObjectClass(rec.name, rec.group, rec.isReal);
  }
}

describe('Dataset Selectors (v1.1.3)', () => {
  beforeAll(() => {
    initTestCatalog();
  });

  describe('Core invariants', () => {
    it('expanded dataset length equals total catalog (CS.N)', () => {
      const expanded = getExpandedIndices();
      expect(expanded.length).toBe(CS.N);
    });

    it('operational + riskOverlay = expanded (complete partition)', () => {
      const op = getOperationalIndices();
      const risk = getRiskOverlayIndices();
      expect(op.length + risk.length).toBe(CS.N);
    });

    it('expandedDataset.length >= operationalDataset.length', () => {
      const expanded = getExpandedIndices();
      const operational = getOperationalIndices();
      expect(expanded.length).toBeGreaterThanOrEqual(operational.length);
    });

    it('debrisRiskDataset equals riskOverlayDataset', () => {
      const debris = getDebrisRiskIndices();
      const risk = getRiskOverlayIndices();
      expect(debris).toEqual(risk);
    });
  });

  describe('Debris mode exclusions', () => {
    it('debrisRiskDataset excludes operational satellites', () => {
      const debris = getDebrisRiskIndices();
      for (const idx of debris) {
        expect(isOperationalClass(CS.objectClass[idx])).toBe(false);
      }
    });

    it('debrisRiskDataset does not contain Starlink', () => {
      const debris = getDebrisRiskIndices();
      const starlinkInDebris = debris.filter(i => CS.catalog[i]?.name?.toUpperCase().includes('STARLINK'));
      expect(starlinkInDebris.length).toBe(0);
    });

    it('every debris risk object is a risk class', () => {
      const debris = getDebrisRiskIndices();
      const riskClasses: ObjectClass[] = ['debris', 'rocket_body', 'inactive_payload', 'unknown_object'];
      for (const idx of debris) {
        expect(riskClasses).toContain(CS.objectClass[idx]);
      }
    });
  });

  describe('Mode counters', () => {
    it('operational mode total = operational indices count', () => {
      const total = getModeTotal('operational');
      const indices = getOperationalIndices();
      expect(total).toBe(indices.length);
    });

    it('expanded mode total = CS.N', () => {
      const total = getModeTotal('expanded');
      expect(total).toBe(CS.N);
    });

    it('debris mode total = risk overlay indices count', () => {
      const total = getModeTotal('debris');
      const indices = getRiskOverlayIndices();
      expect(total).toBe(indices.length);
    });

    it('getModeCounters sums correctly', () => {
      const counters = getModeCounters();
      expect(counters.operationalCount + counters.riskOverlayCount).toBe(counters.totalLoaded);
      expect(counters.totalLoaded).toBe(CS.N);
    });
  });

  describe('getModeBaseIndices', () => {
    it('operational mode returns only operational indices', () => {
      const indices = getModeBaseIndices('operational');
      for (const idx of indices) {
        expect(isOperationalClass(CS.objectClass[idx])).toBe(true);
      }
    });

    it('expanded mode returns all indices', () => {
      const indices = getModeBaseIndices('expanded');
      expect(indices.length).toBe(CS.N);
    });

    it('debris mode returns only non-operational indices', () => {
      const indices = getModeBaseIndices('debris');
      for (const idx of indices) {
        expect(isOperationalClass(CS.objectClass[idx])).toBe(false);
      }
    });
  });

  describe('Catalog content checks', () => {
    it('operational dataset has > 0 objects', () => {
      expect(getOperationalIndices().length).toBeGreaterThan(0);
    });

    it('risk overlay dataset has > 0 objects', () => {
      expect(getRiskOverlayIndices().length).toBeGreaterThan(0);
    });

    it('operational dataset includes Starlink', () => {
      const op = getOperationalIndices();
      const hasStarlink = op.some(i => CS.catalog[i]?.name?.toUpperCase().includes('STARLINK'));
      expect(hasStarlink).toBe(true);
    });
  });

  describe('Development assertions', () => {
    it('validateDatasets returns no warnings for valid state', () => {
      const warnings = validateDatasets('operational');
      expect(warnings.length).toBe(0);
    });

    it('validateDatasets checks debris mode for Starlink contamination', () => {
      const warnings = validateDatasets('debris');
      expect(warnings.length).toBe(0);
    });
  });
});
