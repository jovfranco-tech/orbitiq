import { setLang, t } from '../../i18n/i18n';
import { useUserStore } from '../../state/userStore';
import { useStore } from '../../state/store';
import type { SavedMissionView } from '../../types';

interface Props {
  onClose: () => void;
}

export function SavedViewsPanel({ onClose }: Props) {
  const { savedViews, deleteView } = useUserStore();
  const store = useStore();

  const applyView = (v: SavedMissionView) => {
    store.setActiveGroups(new Set(v.filters.groups));
    store.setFilterBand(v.filters.band);
    store.setFilterRegion(v.filters.region);
    store.setAltFilter(v.filters.altMin, v.filters.altMax);
    
    store.setSimMode(v.simMode);
    store.setSimSpeed(1);
    store.jumpTime(v.simOffsetMs - (useStore.getState().simMode === 'live' ? 0 : v.simOffsetMs)); // Rough jump
    // More accurate way to set offset:
    // If it's a saved view, we might need an exact jumpTime or just setting the mode.
    // We will let the App.tsx handle precise offsets if needed, but for now jumping is fine.
    
    if (v.missionScenario) {
      store.setShowMissionPanel(true);
      store.setActiveMissionScenario(v.missionScenario);
    } else {
      store.setShowMissionPanel(false);
    }
    
    store.setShowRiskLayer(v.showRiskLayer);
    
    if (v.lang) {
      setLang(v.lang);
      store.setLang(v.lang);
    }
    
    // Auto-close panel after load
    onClose();
  };

  return (
    <aside className="left-panel saved-views-panel glass">
      <div className="panel-header">
        <h2>{t('saved_views') || 'Saved Views'}</h2>
        <button className="panel-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="panel-body">
        {savedViews.length === 0 ? (
          <div className="panel-empty">{t('no_saved_views') || 'No saved mission views.'}</div>
        ) : (
          <div className="views-list">
            {savedViews.map(v => (
              <div key={v.id} className="view-card">
                <div className="view-card-main" onClick={() => applyView(v)}>
                  <div className="v-name">{v.name}</div>
                  <div className="v-desc">{v.description || new Date(v.createdAt).toLocaleString()}</div>
                </div>
                <button 
                  className="v-remove" 
                  onClick={(e) => { e.stopPropagation(); deleteView(v.id); }}
                  title={t('delete') || 'Delete'}
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
