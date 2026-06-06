import { setLang, t } from '../../i18n/i18n';
import { useUserStore } from '../../state/userStore';
import { useStore } from '../../state/store';
import { CS } from '../../state/catalogStore';
import type { SavedMissionView } from '../../types';

interface Props {
  onClose: () => void;
}

export function SavedViewsPanel({ onClose }: Props) {
  const { savedViews, deleteView, renameView } = useUserStore();
  const store = useStore();

  const applyView = (v: SavedMissionView) => {
    store.setActiveGroups(new Set(v.filters.groups));
    store.setFilterBand(v.filters.band);
    store.setFilterRegion(v.filters.region);
    store.setAltFilter(v.filters.altMin, v.filters.altMax);
    
    store.setSimSpeed(1);
    CS.simTimestampMs = Date.now() + v.simOffsetMs;
    store.setSimMode(v.simMode);
    
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
                  aria-label={t('delete') || 'Delete'}
                >
                  ✕
                </button>
                <button
                  className="v-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = window.prompt(t('rename_view') || 'Rename view', v.name);
                    if (next?.trim()) renameView(v.id, next.trim().slice(0, 80));
                  }}
                  title={t('rename_view') || 'Rename view'}
                  aria-label={t('rename_view') || 'Rename view'}
                >
                  ✎
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
