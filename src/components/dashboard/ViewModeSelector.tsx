// ============================================================
// OrbitIQ — Expanded Orbital Environment mode selector
//
// Premium 3-way selector that separates the operational satellite
// view from the expanded tracked-object environment and the
// debris / collision-risk view. Includes a mode badge, explanatory
// microcopy, mode-aware metrics and the executive credibility card.
// ============================================================
import { useState } from 'react';
import { t } from '../../i18n/i18n';
import { OBJECT_CLASS_META } from '../../data/objectClass';
import type { TleApiMeta, ViewMode } from '../../types';

interface Props {
  mode: ViewMode;
  loading: boolean;
  meta: TleApiMeta | null;
  onSetMode: (m: ViewMode) => void;
}

const MODES: Array<{ id: ViewMode; labelKey: string; descKey: string; icon: string }> = [
  { id: 'operational', labelKey: 'mode_operational', descKey: 'mode_operational_desc', icon: '🛰' },
  { id: 'expanded',    labelKey: 'mode_expanded',    descKey: 'mode_expanded_desc',    icon: '🌐' },
  { id: 'debris',      labelKey: 'mode_debris',      descKey: 'mode_debris_desc',       icon: '⚠' },
];

// Above this rendered-object count we surface the performance safeguard note.
const SAFEGUARD_THRESHOLD = 16000;

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

export function ViewModeSelector({ mode, loading, meta, onSetMode }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const active = MODES.find((m) => m.id === mode) ?? MODES[0];
  const isExpanded = mode !== 'operational';

  const total = meta?.totalObjects ?? meta?.count ?? 0;
  const debris = meta?.debrisCount ?? 0;
  const rocket = meta?.rocketBodyCount ?? 0;
  const inactive = meta?.inactivePayloadCount ?? 0;
  const operational = (meta?.operationalCount ?? 0) + (meta?.activePayloadCount ?? 0);
  const nonOperational = debris + rocket + inactive + (meta?.unknownCount ?? 0);
  const liveCount = meta?.liveCount ?? total;
  const demoCount = meta?.demoCount ?? 0;
  const hasDemo = demoCount > 0;
  const isDemo = meta?.dataMode === 'fallback' || hasDemo || /DEMO/i.test(meta?.source ?? '');

  return (
    <section className="view-mode-selector glass" aria-label={t('mode_selector_aria')}>
      <div className="vms-head">
        <span className={`vms-badge vms-badge-${mode}`}>{active.icon} {t(active.labelKey)}</span>
        {loading && <span className="vms-loading" role="status">{t('mode_loading')}</span>}
        <button
          type="button"
          className="vms-info-btn"
          aria-expanded={showInfo}
          aria-label={t('mode_info_aria')}
          onClick={() => setShowInfo((v) => !v)}
        >ⓘ</button>
      </div>

      <div className="vms-seg" role="group" aria-label={t('mode_selector_aria')}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`vms-seg-btn${mode === m.id ? ' on' : ''}`}
            aria-pressed={mode === m.id}
            disabled={loading}
            title={t(m.descKey)}
            onClick={() => onSetMode(m.id)}
          >
            <span className="vms-seg-icon" aria-hidden="true">{m.icon}</span>
            <span className="vms-seg-label">{t(m.labelKey)}</span>
          </button>
        ))}
      </div>

      <p className="vms-microcopy">{t('mode_microcopy')}</p>

      {showInfo && (
        <div className="vms-info">
          {MODES.map((m) => (
            <div key={m.id} className="vms-info-row">
              <b>{m.icon} {t(m.labelKey)}</b>
              <span>{t(m.descKey)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mode-aware metrics */}
      {isExpanded && meta && (
        <div className="vms-metrics" aria-label={t('mode_metrics_aria')}>
          {mode === 'debris' ? (
            <>
              <ClassChip cls="debris" label={t('class_debris')} value={fmt(debris)} />
              <ClassChip cls="rocket_body" label={t('class_rocket_body')} value={fmt(rocket)} />
              <ClassChip cls="inactive_payload" label={t('class_inactive_payload')} value={fmt(inactive)} />
              <div className="vms-metric">
                <span className="vms-metric-k">{t('mode_non_operational')}</span>
                <span className="vms-metric-v">{fmt(nonOperational)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="vms-metric">
                <span className="vms-metric-k">{t('mode_total_objects')}</span>
                <span className="vms-metric-v">{fmt(total)}</span>
              </div>
              <div className="vms-metric">
                <span className="vms-metric-k">{t('class_operational_satellite')}</span>
                <span className="vms-metric-v">{fmt(operational)}</span>
              </div>
              <ClassChip cls="rocket_body" label={t('class_rocket_body')} value={fmt(rocket)} />
              <ClassChip cls="debris" label={t('class_debris')} value={fmt(debris)} />
            </>
          )}
        </div>
      )}

      {isExpanded && hasDemo && (
        <div className="vms-count-integrity">
          <span className="vms-count-live">{fmt(liveCount)} {t('mode_live_count')}</span>
          <span className="vms-count-sep">+</span>
          <span className="vms-count-demo">{fmt(demoCount)} {t('mode_demo_count')}</span>
        </div>
      )}

      {isExpanded && isDemo && (
        <p className="vms-demo-note">{t('mode_demo_note')}</p>
      )}

      {isExpanded && total > SAFEGUARD_THRESHOLD && (
        <p className="vms-safeguard">{t('mode_safeguard')}</p>
      )}

      {/* Data integrity note */}
      {isExpanded && (
        <p className="vms-count-note">{t('mode_count_note')}</p>
      )}

      {/* Executive credibility card */}
      <p className="vms-credibility">{t('mode_credibility')}</p>
    </section>
  );
}

function ClassChip({ cls, label, value }: { cls: keyof typeof OBJECT_CLASS_META; label: string; value: string }) {
  return (
    <div className="vms-metric" style={{ '--c': OBJECT_CLASS_META[cls].color } as React.CSSProperties}>
      <span className="vms-metric-k"><i className="vms-dot" />{label}</span>
      <span className="vms-metric-v">{value}</span>
    </div>
  );
}
