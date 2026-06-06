import { useStore } from '../../state/store';
import { getLang, t } from '../../i18n/i18n';
import type { ApiHealth, DataMode } from '../../types';

type HealthTone = 'healthy' | 'partial' | 'unavailable';

function toneFor(status: ApiHealth | undefined, hasVisibleData = false): HealthTone {
  if (status === 'unavailable') return hasVisibleData ? 'partial' : 'unavailable';
  if (status === 'degraded' || status === 'fallback') return 'partial';
  return 'healthy';
}

function labelFor(status: ApiHealth | undefined, hasVisibleData = false): string {
  if (status === 'unavailable' && hasVisibleData) return t('health_fallback');
  if (status === 'fallback') return t('health_fallback');
  if (status === 'degraded') return t('health_partial');
  if (status === 'unavailable') return t('health_unavailable');
  if (status === 'healthy') return t('health_healthy');
  return t('health_unknown');
}

function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'N/A';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function dataDetail(dataMode: DataMode, status: ApiHealth | undefined): string {
  if (dataMode === 'live' || status === 'healthy') return t('health_tle_live_detail');
  if (dataMode === 'mixed' || status === 'degraded') return t('health_tle_mixed_detail');
  if (dataMode === 'fallback' || status === 'fallback' || status === 'unavailable') return t('health_tle_fallback_detail');
  return t('health_unknown');
}

function agentDetail(status: ApiHealth | undefined): string {
  if (status === 'healthy') return t('health_agent_live_detail');
  if (status === 'fallback') return t('health_agent_fallback_detail');
  if (status === 'unavailable') return t('health_agent_unavailable_detail');
  return t('health_agent_partial_detail');
}

function friendlyReason(reason?: string): string | null {
  if (!reason) return null;
  if (/Starlink SupGP|Active catalog unavailable/i.test(reason)) return t('health_reason_starlink_subset');
  if (/Network|API failure|timed out|unavailable/i.test(reason)) return t('health_reason_network');
  return reason;
}

function HealthBadge({
  status,
  label,
  detail,
  hasVisibleData,
}: {
  status: ApiHealth | undefined;
  label: string;
  detail: string;
  hasVisibleData?: boolean;
}) {
  const tone = toneFor(status, hasVisibleData);
  return (
    <div className={`health-row health-${tone}`}>
      <span className="health-dot" aria-hidden="true" />
      <div className="health-row-copy">
        <span className="health-label">{label}</span>
        <span className="health-detail">{detail}</span>
      </div>
      <span className="health-state">{labelFor(status, hasVisibleData)}</span>
    </div>
  );
}

export function DataHealthPanel() {
  const {
    showDataHealthPanel,
    setShowDataHealthPanel,
    tleHealth,
    agentHealth,
    tleMeta,
    dataMode,
    totalCount,
  } = useStore();

  if (!showDataHealthPanel) return null;

  const hasVisibleData = totalCount > 0;
  const summaryTone: HealthTone =
    tleHealth === 'unavailable' && !hasVisibleData ? 'unavailable'
      : tleHealth === 'healthy' && agentHealth === 'healthy' ? 'healthy'
      : 'partial';
  const summaryText =
    summaryTone === 'healthy' ? t('health_summary_healthy')
      : summaryTone === 'unavailable' ? t('health_summary_unavailable')
      : t('health_summary_partial');
  const reason = friendlyReason(tleMeta?.fallbackReason);

  return (
    <div className={`health-panel health-panel-${summaryTone}`} role="dialog" aria-label={t('data_health_layer')}>
      <div className="health-head">
        <div>
          <p>{t('health_panel_kicker')}</p>
          <h3>{t('data_health_layer')}</h3>
        </div>
        <button
          className="health-close"
          onClick={() => setShowDataHealthPanel(false)}
          aria-label={getLang() === 'es' ? 'Cerrar' : 'Close'}
        >
          x
        </button>
      </div>

      <div className="health-summary">
        <span>{labelFor(summaryTone === 'partial' ? 'degraded' : summaryTone)}</span>
        <p>{summaryText}</p>
      </div>

      <div className="health-rows">
        <HealthBadge
          status={tleHealth}
          label={t('health_tle_api')}
          detail={dataDetail(dataMode, tleHealth)}
          hasVisibleData={hasVisibleData}
        />
        <HealthBadge
          status={agentHealth}
          label={t('health_agent_api')}
          detail={agentDetail(agentHealth)}
        />
      </div>

      <div className="health-meta">
        <div>
          <span>{t('cache_age')}</span>
          <b>{formatDuration(tleMeta?.cacheAgeSeconds)}</b>
        </div>
        <div>
          <span>{t('cache_ttl')}</span>
          <b>{formatDuration(tleMeta?.cacheTtlSeconds)}</b>
        </div>
        <div className="health-meta-wide">
          <span>{t('data_source')}</span>
          <b title={tleMeta?.source}>{tleMeta?.source || 'N/A'}</b>
        </div>
      </div>

      {reason && (
        <div className="health-note">
          <span>{t('health_note')}</span>
          <p>{reason}</p>
        </div>
      )}
    </div>
  );
}
