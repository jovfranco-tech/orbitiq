import { t } from '../../i18n/i18n';
import { useUserStore } from '../../state/userStore';

interface Props {
  onClose: () => void;
  onSelectSatnum: (satnum: number) => void;
}

export function WatchlistPanel({ onClose, onSelectSatnum }: Props) {
  const { watchlists, removeFromWatchlist } = useUserStore();

  return (
    <aside className="left-panel watchlist-panel glass">
      <div className="panel-header">
        <h2>{t('watchlist')}</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="panel-body">
        {watchlists.length === 0 ? (
          <div className="panel-empty">{t('watchlist_empty') || 'Your watchlist is empty.'}</div>
        ) : (
          <div className="watchlist-list">
            {watchlists.map(w => (
              <div key={w.satnum} className="watchlist-item">
                <div className="watchlist-item-main" onClick={() => onSelectSatnum(w.satnum)}>
                  <div className="w-name">{w.name}</div>
                  <div className="w-meta">
                    {w.satnum} · {w.group.toUpperCase()} · {w.band}
                  </div>
                </div>
                <button 
                  className="w-remove" 
                  onClick={(e) => { e.stopPropagation(); removeFromWatchlist(w.satnum); }}
                  title={t('remove') || 'Remove'}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="panel-footer">
        <small>{t('local_storage_note') || 'Saved locally in this browser. Only public metadata stored.'}</small>
      </div>
    </aside>
  );
}
