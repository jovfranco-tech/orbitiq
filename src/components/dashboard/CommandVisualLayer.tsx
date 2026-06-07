import { useStore } from '../../state/store';

export function CommandVisualLayer() {
  const cinematicMode = useStore((s) => s.cinematicMode);
  const visualQuality = useStore((s) => s.visualQuality);
  const commandPulse = useStore((s) => s.commandPulse);
  const selected = useStore((s) => s.selected);
  const showMissionPanel = useStore((s) => s.showMissionPanel);
  const showRiskLayer = useStore((s) => s.showRiskLayer);
  const activeMissionScenario = useStore((s) => s.activeMissionScenario);
  const filterRegion = useStore((s) => s.filterRegion);
  const filterBand = useStore((s) => s.filterBand);
  const activeGroups = useStore((s) => s.activeGroups);

  const hasFocusLayer = selected >= 0 || !!filterRegion || !!filterBand || activeGroups.size > 0;
  const missionActive = showMissionPanel || showRiskLayer || !!activeMissionScenario;

  return (
    <div
      className={[
        'command-visual-layer',
        `quality-${visualQuality}`,
        cinematicMode ? 'is-cinematic' : '',
        selected >= 0 ? 'has-target' : '',
        hasFocusLayer ? 'has-focus-layer' : '',
        missionActive ? 'mission-active' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <div className="visual-vignette" />
      <div className="orbital-density-field" />
      <div className="orbital-sweep sweep-a" />
      <div className="orbital-sweep sweep-b" />
      <div className="risk-pulse-field" />
      <div className="targeting-reticle" />
      <div key={commandPulse} className="agent-command-wave" />
      <div className="regional-heat-field" />
    </div>
  );
}
