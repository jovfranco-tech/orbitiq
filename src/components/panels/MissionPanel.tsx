import { useStore } from '../../state/store';
import { getMissionScenarios } from '../../intelligence/risk';
import { t } from '../../i18n/i18n';
import type { MissionScenarioType, RiskLevel, AgentAction } from '../../types';

export function MissionPanel() {
  const { activeMissionScenario, showMissionPanel } = useStore();
  const scenariosMap = getMissionScenarios();
  const scenarios = Object.values(scenariosMap);

  if (!showMissionPanel) return null;

  // Default to first scenario if none is active
  const activeId = activeMissionScenario || scenarios[0]?.id;
  const activeData = scenariosMap[activeId as string];

  return (
    <div className="intel-panel mission-panel glass">
      <div className="intel-header">
        <h2 className="intel-title">{t('mission_title')}</h2>
        <div className="intel-subtitle">{t('mission_subtitle')}</div>
      </div>

      <div className="mission-selector">
        <select
          className="mission-select"
          value={activeId}
          onChange={(e) => useStore.getState().setActiveMissionScenario(e.target.value as MissionScenarioType)}
        >
          {scenarios.map(s => (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <option key={s.id} value={s.id}>{t(`scenario_${s.id}` as any) || s.title}</option>
          ))}
        </select>
      </div>

      {activeData && (
        <div className="intel-content">
          <div className="mission-context">{activeData.context}</div>

          <div className="intel-section">
            <h3 className="intel-section-title">{t('mission_insight')}</h3>
            <div className="mission-insight-box">
              <div className="mission-insight-text">{activeData.insight}</div>
              <div className="mission-metric">
                <div className="mission-metric-val">{activeData.visibleCount.toLocaleString()}</div>
                <div className="mission-metric-lbl">{t('m_visible_assets')}</div>
              </div>
            </div>
            <div className="mission-relevance">
              <strong>{t('mission_relevance')}:</strong> {activeData.operationalRelevance}
            </div>
          </div>

          {activeData.riskSignal && (
            <div className="intel-section">
              <h3 className="intel-section-title">{t('risk_layer')}</h3>
              <RiskSignalCard 
                score={activeData.riskSignal.score} 
                level={activeData.riskSignal.level} 
                explanation={activeData.riskSignal.explanation} 
                action={activeData.riskSignal.recommendedAction}
              />
            </div>
          )}

          <div className="mission-action-bar">
            <button 
              className="action-btn primary"
              onClick={() => dispatchAction(activeData.recommendedAction)}
            >
              {t('apply_scenario_view')}
            </button>
          </div>

          <div className="intel-footer disclaimer">
            {activeData.caveat} {activeData.riskSignal && activeData.riskSignal.caveat}
          </div>
        </div>
      )}
    </div>
  );
}

function RiskSignalCard({ score, level, explanation, action }: { score: number, level: RiskLevel, explanation: string, action: string }) {
  const colorMap = {
    low: 'var(--green)',
    moderate: 'var(--yellow)',
    elevated: 'var(--orange)',
    high: 'var(--red)'
  };
  const color = colorMap[level] || 'var(--text-muted)';

  return (
    <div className="risk-card" style={{ borderColor: color }}>
      <div className="risk-header">
        <div className="risk-score" style={{ color }}>{score}</div>
        <div className="risk-level" style={{ backgroundColor: `${color}20`, color }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {t(`risk_${level}` as any) || level.toUpperCase()}
        </div>
      </div>
      <div className="risk-explanation">{explanation}</div>
      <div className="risk-action">
        <strong>{t('recommended')}:</strong> {action}
      </div>
    </div>
  );
}

// Minimal dispatcher bridging UI actions to the store directly
function dispatchAction(action: AgentAction) {
  const store = useStore.getState();
  if (action.type === 'filter_by_group') {
    store.resetFilters();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.toggleGroup(action.group as any);
  } else if (action.type === 'filter_by_band') {
    store.resetFilters();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.setFilterBand(action.band as any);
  } else if (action.type === 'highlight_relevant_region') {
    store.resetFilters();
    store.setFilterRegion(action.region);
  } else if (action.type === 'executive_brief') {
    store.setShowBrief(true);
  }
}
