// ============================================================
// OrbitIQ v0.3.0 — Orbital Intelligence Panel
// Right-side panel with band distribution, regional hotspot,
// and congestion indicator. Globe remains the hero.
// ============================================================
import { t } from '../../i18n/i18n';
import { GROUPS } from '../../data/groups';
import { REGIONS } from '../../regions/regions';
import { CongestionIndicator } from './CongestionIndicator';
import type { IntelligenceSummary, GroupKey } from '../../types';

interface Props {
  intelligence: IntelligenceSummary | null;
  onClose: () => void;
}

export function OrbitalIntelligencePanel({ intelligence, onClose }: Props) {
  if (!intelligence) {
    return (
      <aside className="intel glass" id="intelPanel">
        <div className="card-head">
          <div className="card-title">
            <span className="ai-dot" />
            <div>
              <div>{t('intel_title')}</div>
              <div className="card-sub">{t('intel_sub')}</div>
            </div>
          </div>
          <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="empty">{t('intel_no_data')}</div>
      </aside>
    );
  }

  const { bands, mostCrowdedBand, regions, congestionScore, congestionLevel } = intelligence;
  const maxBandCount = Math.max(...bands.map((b) => b.count), 1);
  const topRegion = regions[0];

  return (
    <aside className="intel glass" id="intelPanel">
      {/* Header */}
      <div className="card-head">
        <div className="card-title">
          <span className="ai-dot" />
          <div>
            <div>{t('intel_title')}</div>
            <div className="card-sub">{t('intel_sub')}</div>
          </div>
        </div>
        <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      {/* Band Distribution */}
      <div className="intel-section">
        <div className="intel-section-title">{t('intel_band_dist')}</div>
        <div className="intel-bars">
          {bands.map((b) => (
            <div key={b.band}>
              <div className="intel-bar">
                <span className="intel-bar-label">{b.band}</span>
                <div className="intel-bar-track">
                  <div
                    className={`intel-bar-fill ${b.band.toLowerCase()}`}
                    style={{ width: `${Math.max((b.count / maxBandCount) * 100, 2)}%` }}
                  />
                </div>
                <div className="intel-bar-stats">
                  <span className="intel-bar-count">{b.count.toLocaleString()}</span>
                  <span className="intel-bar-pct">{b.pct}%</span>
                  {b.band === mostCrowdedBand && (
                    <span className="intel-bar-badge">★</span>
                  )}
                </div>
              </div>
              <div className="intel-top-groups">
                {t('intel_avg_alt')}: <span>{b.avgAlt.toLocaleString()} km</span>
                {b.topGroups.length > 0 && (
                  <> · {t('intel_top_groups')}: {b.topGroups.slice(0, 3).map((g) =>
                    <span key={g.group}> {(GROUPS[g.group as GroupKey] ?? GROUPS['other']).label} ({g.count})</span>
                  )}</>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Regional Hotspot */}
      {topRegion && (
        <div className="intel-section">
          <div className="intel-section-title">{t('intel_region_hot')}</div>
          <div className="intel-region">
            <div className="intel-region-name">{topRegion.label}</div>
            <div className="intel-region-count">
              {topRegion.count.toLocaleString()}
              <span className="intel-region-unit">{t('intel_sats_overhead')}</span>
            </div>
            <div className="intel-region-meta">
              <div>{t('intel_dominant_band')}: <b>{topRegion.dominantBand}</b></div>
              <div>{t('intel_top_groups')}: <b>
                {topRegion.topGroups.slice(0, 2).map((g) =>
                  (GROUPS[g.group as GroupKey] ?? GROUPS['other']).label
                ).join(', ')}
              </b></div>
            </div>
          </div>
          {/* Second and third regions as compact items */}
          {regions.slice(1, 4).length > 0 && (
            <div className="intel-top-groups" style={{ marginTop: '4px' }}>
              {regions.slice(1, 4).map((r) => (
                <div key={r.key}>
                  {REGIONS[r.key]?.label ?? r.key}: <span>{r.count.toLocaleString()}</span> · {r.dominantBand}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Congestion Indicator */}
      <div className="intel-section">
        <CongestionIndicator score={congestionScore} level={congestionLevel} />
      </div>

      {/* Data honesty footer */}
      <div className="cong-caveat" style={{ marginTop: '0' }}>
        {t('disclaimer_intel')} {t('disclaimer_density')}
      </div>
    </aside>
  );
}
