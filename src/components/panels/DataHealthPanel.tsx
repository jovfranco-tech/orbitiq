import { useStore } from '../../state/store';
import { t } from '../../i18n/i18n';
import type { ApiHealth } from '../../types';

function HealthBadge({ status, label }: { status: ApiHealth | undefined; label: string }) {
  let color = '#4caf50';
  let dot = '🟢';
  if (status === 'degraded' || status === 'fallback') {
    color = '#ff9800';
    dot = '🟡';
  } else if (status === 'unavailable') {
    color = '#f44336';
    dot = '🔴';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <span style={{ fontSize: '12px' }}>{dot}</span>
      <span style={{ color, fontWeight: 500, fontSize: '13px' }}>{label}</span>
      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginLeft: 'auto' }}>
        {status ? t(`health_${status}`) : t('health_unknown')}
      </span>
    </div>
  );
}

export function DataHealthPanel() {
  const { showDataHealthPanel, setShowDataHealthPanel, tleHealth, agentHealth, tleMeta } = useStore();

  if (!showDataHealthPanel) return null;

  return (
    <div className="health-panel" style={{
      position: 'absolute',
      top: '64px',
      right: '16px',
      width: '320px',
      backgroundColor: 'rgba(10, 10, 15, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      padding: '16px',
      color: '#fff',
      zIndex: 100,
      fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, letterSpacing: '0.5px' }}>
          {t('data_health_layer')}
        </h3>
        <button
          onClick={() => setShowDataHealthPanel(false)}
          style={{
            background: 'none', border: 'none', color: '#fff', opacity: 0.6, cursor: 'pointer',
            padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <HealthBadge status={tleHealth} label={t('health_tle_api')} />
        <HealthBadge status={agentHealth} label={t('health_agent_api')} />
      </div>

      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('cache_age')}</span>
          <span style={{ fontFamily: 'monospace' }}>
            {tleMeta?.cacheAgeSeconds != null ? `${tleMeta.cacheAgeSeconds}s` : 'N/A'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('cache_ttl')}</span>
          <span style={{ fontFamily: 'monospace' }}>
            {tleMeta?.cacheTtlSeconds != null ? `${tleMeta.cacheTtlSeconds}s` : 'N/A'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('data_source')}</span>
          <span style={{ fontFamily: 'monospace', maxWidth: '140px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tleMeta?.source}>
            {tleMeta?.source || 'N/A'}
          </span>
        </div>
      </div>

      {(tleHealth === 'unavailable' || tleHealth === 'degraded' || agentHealth === 'fallback') && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '4px',
          fontSize: '12px',
          lineHeight: 1.4,
          color: '#ffb74d'
        }}>
          {t('safe_mode_active')}
          {(tleHealth === 'unavailable' || tleHealth === 'degraded') && tleMeta?.fallbackReason && (
            <div style={{ marginTop: '8px', fontFamily: 'monospace', opacity: 0.8 }}>
              {t('fallback_reason')}: {tleMeta.fallbackReason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
