// ============================================================
// OrbitIQ v0.3.0 — Executive Orbital Brief modal (v2)
// ============================================================
import { useEffect, useRef } from 'react';
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const headlineId = 'brief-headline';

  // Focus the close button when the dialog opens
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape key + focus trap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }

      // Trap focus inside the dialog
      if (e.key === 'Tab') {
        const dialog = document.getElementById('brief-dialog');
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
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
    : dataMode === 'mixed' ? 'prov_mixed_note'
    : 'prov_demo_note';

  return (
    <div
      className="brief-overlay"
      role="presentation"
      onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
    >
      <div
        id="brief-dialog"
        className="brief glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headlineId}
      >
        <div className="brief-head">
          {dataMode === 'fallback' && (
            <div className="caveat warn" role="alert">
              <strong>{t('fallback_mode')}</strong> {t('disclaimer_demo')}
            </div>
          )}
          {simMode !== 'live' && (
            <div className="caveat sim-warn" role="status">
              <strong>{t('simulated') || 'Simulated'}</strong> {t('simulation_caveat') || 'Scenario simulation uses SGP4 propagation from public TLE data. Accuracy may degrade as simulation time moves away from the TLE epoch. Not for operational aerospace decisions.'}
              <br/>
              <em>Time: {new Date(CS.simTimestampMs - 6 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19)} UTC-6</em>
            </div>
          )}
          <div>
            <div className="brief-kicker">{t('brief_generated')}</div>
            <h2 id={headlineId}>{brief.headline}</h2>
          </div>
          <button
            ref={closeRef}
            className="detail-close"
            onClick={onClose}
            aria-label={lang === 'es' ? 'Cerrar informe ejecutivo' : 'Close executive brief'}
          >
            ×
          </button>
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
          <div className="cong" style={{ marginTop: '4px' }} aria-label={`${t('cong_title')} ${intelligence.congestionScore} / 100 — ${intelligence.congestionLevel}`}>
            <div className="cong-head">
              <span className="cong-label">{t('cong_title')} {t('cong_score')}</span>
              <span className="cong-score" aria-hidden="true">{intelligence.congestionScore}<small>/100</small></span>
            </div>
            <div className="cong-meter" role="progressbar" aria-valuenow={intelligence.congestionScore} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={`cong-meter-fill ${intelligence.congestionLevel}`}
                style={{ width: `${intelligence.congestionScore}%` }}
              />
            </div>
            <div className={`cong-level ${intelligence.congestionLevel}`} aria-hidden="true">
              <i />{intelligence.congestionLevel.charAt(0).toUpperCase() + intelligence.congestionLevel.slice(1)}
            </div>
          </div>
        </div>

        <div className="brief-foot">{t('disclaimer')}</div>
      </div>
    </div>
  );
}
