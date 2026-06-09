// ============================================================
// OrbitIQ — Catalog filter + results panel (mode-aware v1.1.4)
//
// Mode-aware filter labels and object-class chips.
// - Operational: constellation filters, label "Catalog"
// - Expanded: constellation + object class filters, label "Orbital Objects"
// - Debris: object class filters only, label "Risk Objects"
// ============================================================
import { useMemo } from 'react';
import { t } from '../../i18n/i18n';
import { GROUPS, GROUP_ORDER } from '../../data/groups';
import { OBJECT_CLASS_META, OBJECT_CLASS_ORDER } from '../../data/objectClass';
import { REGIONS } from '../../regions/regions';
import { matchRegion } from '../../regions/regions';
import { isOperationalClass } from '../../data/objectClass';
import { useStore } from '../../state/store';
import { CS } from '../../state/catalogStore';
import type { GroupKey, BandKey, ObjectClass } from '../../types';

const RESULT_CAP = 120;
const BAND_OPTIONS: Array<[BandKey | '', string]> = [
  ['', 'f_all'], ['LEO', 'm_leo'], ['MEO', 'm_meo'], ['GEO', 'm_geo'],
];

const RISK_CLASSES: ObjectClass[] = ['debris', 'rocket_body', 'inactive_payload', 'unknown_object'];

interface Props {
  onSelectSat: (i: number) => void;
}

export function CatalogPanel({ onSelectSat }: Props) {
  const {
    activeGroups, activeClasses, filterBand, filterRegion, altMin, altMax, search, selected,
    toggleGroup, toggleClass, setFilterBand, setFilterRegion, setSearch, resetFilters,
    totalCount, viewMode,
  } = useStore();

  // Mode-aware title
  const panelTitle = viewMode === 'debris' ? t('filters_title_debris')
    : viewMode === 'expanded' ? t('filters_title_expanded')
    : t('filters_title');

  // Mode-aware filter label
  const filterLabel = viewMode === 'debris' ? t('f_risk_classes')
    : viewMode === 'expanded' ? t('f_classes')
    : t('f_groups');

  // totalCount is used as a reactive dep to trigger re-render after catalog load
  const { visibleList, totalMatching } = useMemo(() => {
    if (CS.N === 0) return { visibleList: [], totalMatching: 0 };

    const q = search.toLowerCase().trim();
    const list: number[] = [];
    let total = 0;
    const debrisEmphasis = viewMode === 'debris' && activeClasses.size === 0;
    const operationalOnly = viewMode === 'operational';

    for (let i = 0; i < CS.N; i++) {
      if (operationalOnly && !isOperationalClass(CS.objectClass[i])) continue;
      if (debrisEmphasis && isOperationalClass(CS.objectClass[i])) continue;
      if (activeClasses.size && !activeClasses.has(CS.objectClass[i])) continue;
      if (activeGroups.size && !activeGroups.has(CS.group[i])) continue;
      if (filterBand && CS.alt[i] >= 0 && CS.band[i] !== filterBand) continue;
      if (filterRegion && CS.alt[i] >= 0 && !matchRegion(CS.lat[i], CS.lon[i], filterRegion)) continue;
      if (altMax != null && CS.alt[i] >= 0 && CS.alt[i] > altMax) continue;
      if (altMin != null && CS.alt[i] >= 0 && CS.alt[i] < altMin) continue;
      const c = CS.catalog[i];
      if (!c) continue;
      if (q && !(c.name.toLowerCase().includes(q) || String(c.satnum).includes(q))) continue;
      if (list.length < RESULT_CAP) list.push(i);
      total++;
    }
    return { visibleList: list, totalMatching: total };
  }, [search, activeGroups, activeClasses, filterBand, filterRegion, altMin, altMax, selected, totalCount, viewMode]);

  // Data-source microcopy
  const sourceCopy = viewMode === 'debris' ? t('mode_source_debris')
    : viewMode === 'expanded' ? t('mode_source_expanded')
    : t('mode_source_operational');

  return (
    <section className="card glass catalog">
      <div className="card-head">
        <div className="card-title"><div>{panelTitle}</div></div>
        <button className="link-btn" onClick={resetFilters}>{t('f_reset')}</button>
      </div>

      {/* Data-source microcopy */}
      <p className="catalog-source-copy">{sourceCopy}</p>

      <div className="search">
        <svg viewBox="0 0 24 24" width="15" height="15">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" fill="none"/>
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder={t('search_placeholder')}
          aria-label={t('search_placeholder')}
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Object class filter chips (Expanded + Debris modes) */}
      {viewMode !== 'operational' && (
        <div className="filter-block">
          <div className="filter-label">{filterLabel}</div>
          <div className="chip-row">
            {(viewMode === 'debris' ? RISK_CLASSES : OBJECT_CLASS_ORDER).map((cls) => {
              const meta = OBJECT_CLASS_META[cls];
              const on = !activeClasses.size || activeClasses.has(cls);
              return (
                <button
                  key={cls}
                  className={`chip ${on ? 'on' : 'off'}`}
                  style={{ '--c': meta.color } as React.CSSProperties}
                  onClick={() => toggleClass(cls)}
                >
                  <i />{t(meta.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Constellation filter chips (Operational + Expanded only) */}
      {viewMode !== 'debris' && (
        <div className="filter-block">
          <div className="filter-label">{t('f_groups')}</div>
          <div className="chip-row">
            {GROUP_ORDER.map((g) => {
              const m = GROUPS[g];
              const on = !activeGroups.size || activeGroups.has(g);
              return (
                <button
                  key={g}
                  className={`chip ${on ? 'on' : 'off'}`}
                  style={{ '--c': m.color } as React.CSSProperties}
                  onClick={() => toggleGroup(g as GroupKey)}
                >
                  <i />{m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="filter-grid">
        <div className="filter-block">
          <div className="filter-label">{t('f_band')}</div>
          <div className="seg">
            {BAND_OPTIONS.map(([v, k]) => (
              <button
                key={v}
                data-band={v}
                className={(filterBand ?? '') === v ? 'on' : ''}
                onClick={() => setFilterBand((v as BandKey) || null)}
              >{t(k)}</button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <div className="filter-label">{t('f_region')}</div>
          <select
            className="sel"
            aria-label={t('f_region')}
            value={filterRegion ?? ''}
            onChange={(e) => setFilterRegion(e.target.value || null)}
          >
            <option value="">{t('f_all')}</option>
            {Object.entries(REGIONS).map(([k]) => (
              <option key={k} value={k}>{t('region_' + k)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="results-head">
        <span>{totalMatching.toLocaleString()}</span>{' '}
        <span>{t('results')}</span>
      </div>

      <div className="results" tabIndex={0} role="group" aria-label={t('results')}>
        {visibleList.length === 0
          ? <div className="empty">{t('no_results')}</div>
          : visibleList.map((i) => {
              const c = CS.catalog[i];
              if (!c) return null;
              const m = GROUPS[CS.group[i]] ?? GROUPS['other'];
              const altTxt = CS.alt[i] >= 0 ? Math.round(CS.alt[i]).toLocaleString() + ' km' : '—';
              const classLabel = CS.objectClass[i] && CS.objectClass[i] !== 'operational_satellite' && CS.objectClass[i] !== 'active_payload'
                ? ` · ${CS.objectClass[i].replace(/_/g, ' ')}`
                : '';
              return (
                <div
                  key={c.satnum}
                  className={`res${i === selected ? ' sel' : ''}`}
                  style={{ '--c': m.color } as React.CSSProperties}
                  onClick={() => onSelectSat(i)}
                >
                  <i />
                  <div className="res-main">
                    <div className="res-name">{c.name}</div>
                    <div className="res-meta">{c.satnum} · {m.label}{classLabel}</div>
                  </div>
                  <div className="res-alt">{altTxt}</div>
                </div>
              );
            })
        }
      </div>
    </section>
  );
}
