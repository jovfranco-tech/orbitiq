// ============================================================
// OrbitIQ v0.3.0 — Executive Orbital Brief modal (v2)
// ============================================================
import { useEffect } from 'react';
import { t } from '../../i18n/i18n';
import { generateBrief } from '../../ai/agent';
import { GROUPS } from '../../data/groups';
import { useStore } from '../../state/store';
import { CS } from '../../state/catalogStore';
import { getIntelligence } from '../../intelligence/intelligence';
import type { GroupKey } from '../../types';

interface Props {
  onClose: () => void;
}

export function BriefModal({ onClose }: Props) {
  const { dataMode, renderedCount, totalCount, simMode, lang } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groupCounts: Record<string, number> = {};
  const bandCounts = { LEO: 0, MEO: 0, GEO: 0 };
  for (let i = 0; i < CS.N; i++) {
    if (CS.alt[i] < 0) continue;
    groupCounts[CS.group[i]] = (groupCounts[CS.group[i]] ?? 0) + 1;
    if (CS.band[i] in bandCounts) bandCounts[CS.band[i] as keyof typeof bandCounts]++;
  }

  const intelligence = getIntelligence();

  const brief = generateBrief({
    total: totalCount, rendered: renderedCount,
    groupCounts, bandCounts,
    groupLabel: (g: GroupKey) => (GROUPS[g] ?? GROUPS['other']).label,
    dataMode,
    intelligence,
    lang,
  });

  const provKey = dataMode === 'live' ? 'prov_live_note'
    : dataMode === 'cached' ? 'prov_cached_note'
    : 'prov_demo_note';

  return (
    <div className="brief-overlay" onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div className="brief glass">
        <div className="brief-head">
          {dataMode === 'fallback' && (
            <div className="caveat warn">
              <strong>{t('fallback_mode')}</strong> {t('disclaimer_demo')}
            </div>
          )}
          {simMode !== 'live' && (
            <div className="caveat sim-warn">
              <strong>{t('simulated') || 'Simulated'}</strong> {t('simulation_caveat') || 'Scenario simulation uses SGP4 propagation from public TLE data. Accuracy may degrade as simulation time moves away from the TLE epoch. Not for operational aerospace decisions.'}
              <br/>
              <em>Time: {new Date(CS.simTimestampMs - 6 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19)} UTC-6</em>
            </div>
          )}
          <div>
            <div className="brief-kicker">{t('brief_generated')}</div>
            <h2>{brief.headline}</h2>
          </div>
          <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="brief-body">
          <div className={`brief-prov m-${dataMode}`}>
            <i />{t(provKey)}
          </div>

          {brief.sections.map((s) => (
            <div key={s.title} className="brief-sec">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}

          {/* Congestion score visual */}
          <div className="cong" style={{ marginTop: '4px' }}>
            <div className="cong-head">
              <span className="cong-label">{t('cong_title')} {t('cong_score')}</span>
              <span className="cong-score">{intelligence.congestionScore}<small>/100</small></span>
            </div>
            <div className="cong-meter">
              <div
                className={`cong-meter-fill ${intelligence.congestionLevel}`}
                style={{ width: `${intelligence.congestionScore}%` }}
              />
            </div>
            <div className={`cong-level ${intelligence.congestionLevel}`}>
              <i />{intelligence.congestionLevel.charAt(0).toUpperCase() + intelligence.congestionLevel.slice(1)}
            </div>
          </div>
        </div>

        <div className="brief-foot">{t('disclaimer')}</div>
      </div>
    </div>
  );
}
