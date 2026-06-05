// ============================================================
// OrbitIQ — Top bar: brand, provenance chip, metrics, actions
// ============================================================
import { t } from '../../i18n/i18n';
import { useStore } from '../../state/store';
import type { DataMode } from '../../types';

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
}

export function TopBar({ onOpenBrief, onResetView, onToggleRotate, onSetLang }: Props) {
  const { dataMode, totalCount, renderedCount, regionCount, filterRegion, ageDays, lang, autoRotate } = useStore();
  const [lblKey, noteKey, cls] = PROV_MAP[dataMode] ?? PROV_MAP['fallback'];

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

      <div className="topbar-tag">{t('tagline')}</div>

      {/* Metric strip */}
      <div className="metrics">
        <Metric label={t('m_total')} value={totalCount.toLocaleString()} />
        <Metric label={t('m_rendered')} value={renderedCount.toLocaleString()} accent />
        <Metric label={t('m_fresh')} value={fresh} />
        {filterRegion && <Metric label={t('m_region')} value={regionCount.toLocaleString()} accent />}
        <Metric label={t('m_ai')} value={t('ai_ready')} green />
      </div>

      {/* Actions */}
      <div className="topbar-actions">
        <button className="ctl" onClick={onOpenBrief}>
          <svg viewBox="0 0 24 24" width="15" height="15">
            <path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          </svg>
          <span>{t('brief_title')}</span>
        </button>
        <button className="ctl ctl-icon" onClick={onResetView} title={t('reset_view')}>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M12 4v3M12 17v3M4 12h3M17 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" fill="none"/>
          </svg>
        </button>
        <button className="ctl ctl-icon" onClick={onToggleRotate}
          aria-pressed={autoRotate} title={t('autorotate')}>
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v3.2h-3.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="lang">
          <button data-lang="en" className={lang === 'en' ? 'on' : ''} onClick={() => onSetLang('en')}>EN</button>
          <button data-lang="es" className={lang === 'es' ? 'on' : ''} onClick={() => onSetLang('es')}>ES</button>
        </div>
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
