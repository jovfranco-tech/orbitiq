// ============================================================
// OrbitIQ — Top bar: brand, provenance chip, metrics, actions
// v0.3.0: + congestion metric + intelligence toggle
// ============================================================
import { t } from '../../i18n/i18n';
import { useStore } from '../../state/store';
import { useUserStore } from '../../state/userStore';
import { CongestionIndicator } from '../panels/CongestionIndicator';
import { playClick } from '../../utils/audio';
import type { DataMode, IntelligenceSummary, VisualQuality } from '../../types';

const PROV_MAP: Record<DataMode, [string, string, string]> = {
  live:    ['prov_live',    'prov_live_note',   'm-live'],
  cached:  ['prov_cached',  'prov_cached_note',  'm-cached'],
  fallback:['prov_demo',    'prov_demo_note',    'm-demo'],
  mixed:   ['prov_mixed',   'prov_mixed_note',   'm-cached'],
  loading: ['status_loading','prov_demo_note',   'm-loading'],
};

const QUALITY_OPTIONS: Array<{ value: VisualQuality; shortKey: string; labelKey: string }> = [
  { value: 'performance', shortKey: 'quality_performance_short', labelKey: 'quality_performance' },
  { value: 'cinematic', shortKey: 'quality_cinematic_short', labelKey: 'quality_cinematic' },
  { value: 'presentation', shortKey: 'quality_presentation_short', labelKey: 'quality_presentation' },
];

interface Props {
  onOpenBrief: () => void;
  onResetView: () => void;
  onToggleRotate: () => void;
  onSetLang: (l: 'en' | 'es') => void;
  onToggleIntel: () => void;
  onToggleMission: () => void;
  onToggleCinematic: () => void;
  intelligence: IntelligenceSummary | null;
}

export function TopBar({ onOpenBrief, onResetView, onToggleRotate, onSetLang, onToggleIntel, onToggleMission, onToggleCinematic, intelligence }: Props) {
  const { dataMode, totalCount, renderedCount, regionCount, filterRegion, ageDays, lang, autoRotate, showIntelligence, showMissionPanel, cinematicMode, visualQuality, setVisualQuality, tleHealth, agentHealth, showDataHealthPanel, setShowDataHealthPanel } = useStore();
  const { showWatchlistPanel, setShowWatchlistPanel, showSavedViewsPanel, setShowSavedViewsPanel, showSnapshotPanel, setShowSnapshotPanel } = useUserStore();
  
  const [lblKey, noteKey, cls] = PROV_MAP[dataMode] ?? PROV_MAP['fallback'];
  
  const overallHealth = tleHealth === 'unavailable' && totalCount === 0 ? 'unavailable'
                      : tleHealth === 'unavailable' || tleHealth === 'degraded' || agentHealth === 'fallback' || agentHealth === 'degraded' ? 'degraded'
                      : 'healthy';
  const healthDotColor = overallHealth === 'healthy' ? '#06d6a0' : overallHealth === 'degraded' ? '#ffd166' : '#ff6b6b';

  const fresh = ageDays < 1
    ? `${(ageDays * 24).toFixed(0)}h`
    : `${ageDays.toFixed(1)}d`;

  return (
    <header className="topbar glass">
      {/* Brand */}
      <div className="brand">
        <div className="brand-mark"><span /></div>
        <div className="brand-text">
          <div className="brand-name">{t('brand')}</div>
          <div className="brand-sub">{t('brandSub')}</div>
        </div>
      </div>

      {/* Provenance chip */}
      <button className={`prov ${cls}`} type="button">
        <i className="dot" />
        <span className="prov-label">{t(lblKey)}</span>
        <svg className="prov-i" viewBox="0 0 24 24" width="13" height="13">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" fill="none"/>
          <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <span className="prov-pop" role="tooltip">
          <b>{t('provenance')}</b>{t(noteKey)}
        </span>
      </button>

      {/* Staleness badge — visible when TLE data is older than 3 days */}
      {ageDays > 3 && (
        <div
          className="staleness-badge"
          title={lang === 'es'
            ? `Datos TLE con ${ageDays.toFixed(1)} días de antigüedad. La precisión disminuye con el tiempo.`
            : `TLE data is ${ageDays.toFixed(1)} days old. Accuracy degrades over time.`}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {lang === 'es' ? `${ageDays.toFixed(0)}d antigüedad` : `${ageDays.toFixed(0)}d old`}
        </div>
      )}

      <button
        onClick={() => { playClick(); setShowDataHealthPanel(!showDataHealthPanel); }}
        className={`ctl ctl-icon ${showDataHealthPanel ? 'intel-active' : ''}`}
        style={{ padding: '0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
        title={t('data_health_layer')}
      >
        <div className="health-top-dot" style={{ backgroundColor: healthDotColor, boxShadow: `0 0 8px ${healthDotColor}` }} />
      </button>

      <div className="topbar-tag">{t('tagline')}</div>

      {/* Metric strip */}
      <div className="metrics" tabIndex={0} role="group" aria-label={t('metrics_label')}>
        <Metric label={t('m_total')} value={totalCount.toLocaleString()} />
        <Metric label={t('m_rendered')} value={renderedCount.toLocaleString()} accent />
        <Metric label={t('m_fresh')} value={fresh} />
        {filterRegion && <Metric label={t('m_region')} value={regionCount.toLocaleString()} accent />}
        {intelligence && (
          <div className="metric">
            <div className="metric-k">{t('cong_title')}</div>
            <div className="metric-v">
              <CongestionIndicator
                score={intelligence.congestionScore}
                level={intelligence.congestionLevel}
                compact
              />
            </div>
          </div>
        )}
        <Metric label={t('m_ai')} value={t('ai_ready')} green />
      </div>

      {/* Actions */}
      <div className="topbar-actions">
        <button
          id="briefBtn"
          className="ctl"
          onClick={() => { playClick(); onOpenBrief(); }}
          title={t('brief_title')}
          aria-label={t('brief_title')}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6" />
            <path d="M9 17h5" />
          </svg>
          <span>{t('brief_short')}</span>
        </button>
        <button
          className={`ctl ctl-icon${showWatchlistPanel ? ' intel-active' : ''}`}
          onClick={() => { playClick(); setShowWatchlistPanel(!showWatchlistPanel); }}
          title={t('watchlist') || 'Watchlist'}
          aria-label={t('watchlist') || 'Watchlist'}
        >
          🔖
        </button>
        <button
          className={`ctl ctl-icon${showSavedViewsPanel ? ' intel-active' : ''}`}
          onClick={() => { playClick(); setShowSavedViewsPanel(!showSavedViewsPanel); }}
          title={t('saved_views') || 'Saved Views'}
          aria-label={t('saved_views') || 'Saved Views'}
        >
          💾
        </button>
        <button className={`ctl ${showSnapshotPanel ? 'active' : ''}`} aria-pressed={showSnapshotPanel} onClick={() => { playClick(); setShowSnapshotPanel(!showSnapshotPanel); }} title={t('executive_snapshot_title')} aria-label={t('executive_snapshot_title')}>
          📸
        </button>
        <button className={`ctl ${showMissionPanel ? 'active' : ''}`} aria-pressed={showMissionPanel} onClick={() => { playClick(); onToggleMission(); }} title={t('mission_title')} aria-label={t('mission_title')}>
          <span className="ctl-icon">🎯</span>
        </button>
        <button className={`ctl ${showIntelligence ? 'intel-active' : ''}`} aria-pressed={showIntelligence} onClick={() => { playClick(); onToggleIntel(); }} title={t('intel_layer')} aria-label={t('intel_layer')}>
          <span className="ctl-icon">⚡</span>
        </button>
        <div className="quality-switch" role="group" aria-label={t('visual_quality')}>
          {QUALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={visualQuality === option.value ? 'on' : ''}
              aria-pressed={visualQuality === option.value}
              title={t(option.labelKey)}
              onClick={() => {
                playClick();
                setVisualQuality(option.value);
              }}
            >
              {t(option.shortKey)}
            </button>
          ))}
        </div>
        <button
          className={`ctl ctl-icon ${cinematicMode ? 'active' : ''}`}
          aria-pressed={cinematicMode}
          onClick={() => { playClick(); onToggleCinematic(); }}
          title={t('cinematic_mode')}
          aria-label={t('cinematic_mode')}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V5a1 1 0 0 1 1-1h4" />
            <path d="M15 4h4a1 1 0 0 1 1 1v4" />
            <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
            <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
        </button>

        <div style={{width:'1px',height:'20px',background:'var(--border)',margin:'0 4px'}} />

        <button className={`ctl ctl-icon ${autoRotate ? 'active' : ''}`} aria-pressed={autoRotate} onClick={() => { playClick(); onToggleRotate(); }} title={t('auto_rotate')} aria-label={t('auto_rotate')}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button className="ctl ctl-icon" onClick={() => { playClick(); onResetView(); }} title={t('reset_view')} aria-label={t('reset_view')}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <div className="v-div" />
        <button className="ctl lang-btn" onClick={() => onSetLang(lang === 'en' ? 'es' : 'en')} aria-label="Toggle language">
          {lang.toUpperCase()}
        </button>
      </div>
    </header>
  );
}

function Metric({ label, value, accent, green }: { label: string; value: string; accent?: boolean; green?: boolean }) {
  return (
    <div className={`metric${accent ? ' accent' : ''}`}>
      <div className="metric-k">{label}</div>
      <div className="metric-v" style={green ? { color: 'var(--green)', fontSize: '0.75rem' } : undefined}>
        {value}
      </div>
    </div>
  );
}
