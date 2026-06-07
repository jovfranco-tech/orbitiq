// ============================================================
// OrbitIQ — Catalog filter + results panel
// ============================================================
import { useMemo } from 'react';
import { t } from '../../i18n/i18n';
import { GROUPS, GROUP_ORDER } from '../../data/groups';
import { REGIONS } from '../../regions/regions';
import { matchRegion } from '../../regions/regions';
import { useStore } from '../../state/store';
import { CS } from '../../state/catalogStore';
import type { CatalogStore } from '../../state/catalogStore';
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
    activeGroups, filterBand, filterRegion, altMin, altMax, search, selected,
    toggleGroup, setFilterBand, setFilterRegion, setSearch, resetFilters,
    totalCount,
  } = useStore();

  // totalCount is used as a reactive dep to trigger re-render after catalog load
  const { visibleList, totalMatching } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list: number[] = [];
    let total = 0;
    for (let i = 0; i < CS.N; i++) {
      if (CS.alt[i] < 0 && i !== selected) continue;
      const passes = checkPasses(i, activeGroups, filterBand, filterRegion, altMin, altMax, CS);
      if (!passes && i !== selected) continue;
      const c = CS.catalog[i];
      if (q && !(c.name.toLowerCase().includes(q) || String(c.satnum).includes(q))) continue;
      if (list.length < RESULT_CAP) list.push(i);
      total++;
    }
    return { visibleList: list, totalMatching: total };
  }, [search, activeGroups, filterBand, filterRegion, altMin, altMax, selected, totalCount]); // totalCount triggers re-render on catalog load

  return (
    <section className="card glass catalog">
      <div className="card-head">
        <div className="card-title"><div>{t('filters_title')}</div></div>
        <button className="link-btn" onClick={resetFilters}>{t('f_reset')}</button>
      </div>

      <div className="search">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" fill="none"/>
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder={t('search_placeholder')}
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('search_placeholder')}
        />
      </div>

      <div className="filter-block">
        <div className="filter-label">{t('f_groups')}</div>
        <div className="chip-row" role="group" aria-label={t('f_groups')}>
          {GROUP_ORDER.map((g) => {
            const m = GROUPS[g];
            const on = !activeGroups.size || activeGroups.has(g);
            return (
              <button
                key={g}
                className={`chip ${on ? 'on' : 'off'}`}
                style={{ '--c': m.color } as React.CSSProperties}
                onClick={() => toggleGroup(g as GroupKey)}
                aria-pressed={on}
                aria-label={m.label}
              >
                <i aria-hidden="true" />{m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-grid">
        <div className="filter-block">
          <div className="filter-label">{t('f_band')}</div>
          <div className="seg" role="group" aria-label={t('f_band')}>
            {BAND_OPTIONS.map(([v, k]) => (
              <button
                key={v}
                data-band={v}
                className={(filterBand ?? '') === v ? 'on' : ''}
                onClick={() => setFilterBand((v as BandKey) || null)}
                aria-pressed={(filterBand ?? '') === v}
              >{t(k)}</button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <div className="filter-label">{t('f_region')}</div>
          <select
            className="sel"
            value={filterRegion ?? ''}
            onChange={(e) => setFilterRegion(e.target.value || null)}
            aria-label={t('f_region')}
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

      <div className="results">
        {visibleList.length === 0
          ? <div className="empty">{t('no_results')}</div>
          : visibleList.map((i) => {
              const c = CS.catalog[i];
              if (!c) return null; // bounds guard
              const m = GROUPS[CS.group[i]] ?? GROUPS['other'];
              const altTxt = CS.alt[i] >= 0 ? Math.round(CS.alt[i]).toLocaleString() + ' km' : '—';
              return (
                <div
                  key={c.satnum}
                  className={`res${i === selected ? ' sel' : ''}`}
                  style={{ '--c': m.color } as React.CSSProperties}
                  onClick={() => onSelectSat(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSat(i); } }}
                  aria-label={`${c.name}, NORAD ${c.satnum}, ${m.label}, ${altTxt}`}
                  aria-pressed={i === selected}
                >
                  <i aria-hidden="true" />
                  <div className="res-main">
                    <div className="res-name">{c.name}</div>
                    <div className="res-meta">{c.satnum} · {m.label}</div>
                  </div>
                  <div className="res-alt" aria-hidden="true">{altTxt}</div>
                </div>
              );
            })
        }
      </div>
    </section>
  );
}

// Filter check — mirrors the authoritative hot loop in App.tsx
function checkPasses(
  i: number,
  activeGroups: Set<GroupKey>,
  filterBand: BandKey | null,
  filterRegion: string | null,
  altMin: number | null,
  altMax: number | null,
  cs: CatalogStore,
): boolean {
  if (cs.alt[i] < 0) return false;
  if (activeGroups.size && !activeGroups.has(cs.group[i])) return false;
  if (filterBand && cs.band[i] !== filterBand) return false;
  if (filterRegion && !matchRegion(cs.lat[i], cs.lon[i], filterRegion)) return false;
  if (altMax != null && cs.alt[i] > altMax) return false;
  if (altMin != null && cs.alt[i] < altMin) return false;
  return true;
}
