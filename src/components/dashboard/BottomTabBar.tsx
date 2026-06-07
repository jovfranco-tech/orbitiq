import { useRef } from 'react';
import { useStore } from '../../state/store';
import { t } from '../../i18n/i18n';
import { playClick } from '../../utils/audio';

export function BottomTabBar() {
  const activeTab = useStore((s) => s.activeMobileTab);
  const setActiveTab = useStore((s) => s.setActiveMobileTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs = [
    { id: 'globe',   labelKey: 'tab_globe',   icon: '🌍' },
    { id: 'agent',   labelKey: 'tab_agent',   icon: '🤖' },
    { id: 'catalog', labelKey: 'tab_catalog', icon: '📊' },
    { id: 'intel',   labelKey: 'tab_intel',   icon: '⚡' },
    { id: 'mission', labelKey: 'tab_mission', icon: '🎯' },
  ] as const;

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = tabs.length - 1;
    } else {
      return;
    }
    tabRefs.current[next]?.focus();
    playClick();
    setActiveTab(tabs[next].id);
  };

  return (
    <nav className="bottom-tab-bar glass" aria-label={t('nav_main') || 'Main navigation'}>
      <div role="tablist" aria-label={t('nav_sections') || 'App sections'} style={{ display: 'contents' }}>
        {tabs.map((tab, index) => {
          const isActive = activeIndex === index;
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              className={`tab-item ${isActive ? 'active' : ''}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                playClick();
                setActiveTab(tab.id);
              }}
              onKeyDown={(e) => handleKeyDown(e, index)}
              type="button"
            >
              <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
              <span className="tab-label">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
