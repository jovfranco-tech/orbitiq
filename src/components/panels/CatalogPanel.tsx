// ============================================================
// OrbitIQ — Catalog filter + results panel (mode-aware)
// ============================================================
import { useMemo } from 'react';
import { t } from '../../i18n/i18n';
import { GROUPS, GROUP_ORDER } from '../../data/groups';
import { REGIONS } from '../../regions/regions';
import { matchRegion } from '../../regions/regions';
import { isOperationalClass } from '../../data/objectClass';
import { useStore } from '../../state/store';
import { CS } from '../../state/catalogStore';
import type { GroupKey, BandKey } from '../../types';

const RESULT_CAP = 120;
const BAND_OPTIONS: Array<[BandKey | '', string]> = [
  ['', 'f_all'], ['LEO', 'm_leo'], ['MEO', 'm_meo'], ['GEO', 'm_geo'],
];

interface Props {
  onSelectSat: (i: number) => void;
}

export function CatalogPanel({ onSelectSat }: Props) {
  const {
    activeGroups, activeClasses, filterBand, filterRegion, altMin, altMax, search, selected,
    toggleGroup, setFilterBand, setFilterRegion, setSearch, resetFilters,
    totalCount, viewMode,
  } = useStore();

  // totalCount is used as a reactive dep to trigger re-render after catalog load
  const { visibleList, totalMatching } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list: number[] = [];
    let total = 0;
    // Debris mode emphasis: exclude operational satellites from catalog by default
    const debrisEmphasis = viewMode === 'debris' && activeClasses.size === 0;

    for (let i = 0; i < CS.N; i++) {
      if (CS.alt[i] < 0 && i !== selected) continue;
      // Mode-aware class filtering (mirrors applyFilter logic)
      if (activeClasses.size && !activeClasses.has(CS.objectClass[i])) continue;
      if (debrisEmphasis && isOperationalClass(CS.objectClass[i])) continue;
      // Standard filters
      if (activeGroups.size && !activeGroups.has(CS.group[i])) continue;
      if (filterBand && CS.band[i] !== filterBand) continue;
      if (filterRegion && !matchRegion(CS.lat[i], CS.lon[i], filterRegion)) continue;
      if (altMax != null && CS.alt[i] > altMax) continue;
      if (altMin != null && CS.alt[i] < altMin) continue;
      const c = CS.catalog[i];
      if (q && !(c.name.toLowerCase().includes(q) || String(c.satnum).includes(q))) continue;
      if (list.length < RESULT_CAP) list.push(i);
      total++;
    }
    return { visibleList: list, totalMatching: total };
  }, [search, activeGroups, activeClasses, filterBand, filterRegion, altMin, altMax, selected, totalCount, viewMode]);

  return (
    <section className="card glass catalog">
      <div className="card-head">
        <div className="card-title"><div>{t('filters_title')}</div></div>
        <button className="link-btn" onClick={resetFilters}>{t('f_reset')}</button>
      </div>

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
              if (!c) return null; // bounds guard
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
