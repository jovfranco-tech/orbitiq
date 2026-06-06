import { useStore } from '../../state/store';
import { t } from '../../i18n/i18n';
import { playClick } from '../../utils/audio';

export function BottomTabBar() {
  const activeTab = useStore((s) => s.activeMobileTab);
  const setActiveTab = useStore((s) => s.setActiveMobileTab);

  const tabs = [
    { id: 'globe', labelKey: 'tab_globe', icon: '🌍' },
    { id: 'agent', labelKey: 'tab_agent', icon: '🤖' },
    { id: 'catalog', labelKey: 'tab_catalog', icon: '📊' },
    { id: 'intel', labelKey: 'tab_intel', icon: '⚡' },
    { id: 'mission', labelKey: 'tab_mission', icon: '🎯' },
  ] as const;

  return (
    <nav className="bottom-tab-bar glass">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`tab-item ${isActive ? 'active' : ''}`}
            onClick={() => {
              playClick();
              setActiveTab(tab.id);
            }}
            type="button"
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
