// ============================================================
// OrbitIQ — Top bar: brand, provenance chip, metrics, actions
// v0.3.0: + congestion metric + intelligence toggle
// ============================================================
import { t } from '../../i18n/i18n';
import { useStore } from '../../state/store';
import { useUserStore } from '../../state/userStore';
import { CongestionIndicator } from '../panels/CongestionIndicator';
import { playClick } from '../../utils/audio';
import type { DataMode, IntelligenceSummary } from '../../types';

const PROV_MAP: Record<DataMode, [string, string, string]> = {
  live:    ['prov_live',    'prov_live_note',   'm-live'],
  cached:  ['prov_cached',  'prov_cached_note',  'm-cached'],
  fallback:['prov_demo',    'prov_demo_note',    'm-demo'],
  mixed:   ['prov_cached',  'prov_cached_note',  'm-cached'],
  loading: ['status_loading','prov_demo_note',   'm-loading'],
};

interface Props {
  onOpenBrief: () => void;
  onResetView: () => void;
  onToggleRotate: () => void;
  onSetLang: (l: 'en' | 'es') => void;
  onToggleIntel: () => void;
  onToggleMission: () => void;
  intelligence: IntelligenceSummary | null;
}

export function TopBar({ onResetView, onToggleRotate, onSetLang, onToggleIntel, onToggleMission, intelligence }: Props) {
  const { dataMode, totalCount, renderedCount, regionCount, filterRegion, ageDays, lang, autoRotate, showIntelligence, showMissionPanel, tleHealth, agentHealth, showDataHealthPanel, setShowDataHealthPanel } = useStore();
  const { showWatchlistPanel, setShowWatchlistPanel, showSavedViewsPanel, setShowSavedViewsPanel, showSnapshotPanel, setShowSnapshotPanel } = useUserStore();
  
  const [lblKey, noteKey, cls] = PROV_MAP[dataMode] ?? PROV_MAP['fallback'];
  
  const overallHealth = tleHealth === 'unavailable' || agentHealth === 'fallback' ? 'unavailable'
                      : tleHealth === 'degraded' || agentHealth === 'degraded' ? 'degraded'
                      : 'healthy';
  const healthDotColor = overallHealth === 'healthy' ? '#4caf50' : overallHealth === 'degraded' ? '#ff9800' : '#f44336';

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

      <button
        onClick={() => { playClick(); setShowDataHealthPanel(!showDataHealthPanel); }}
        className={`ctl ctl-icon ${showDataHealthPanel ? 'intel-active' : ''}`}
        style={{ padding: '0 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
        title={t('data_health_layer')}
      >
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: healthDotColor, boxShadow: `0 0 8px ${healthDotColor}` }} />
      </button>

      <div className="topbar-tag">{t('tagline')}</div>

      {/* Metric strip */}
      <div className="metrics">
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
