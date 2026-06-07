import { useEffect, useMemo, useRef, useState } from 'react';
import { getMissionScenarios } from '../../intelligence/risk';
import { t } from '../../i18n/i18n';
import type { MissionScenario, MissionScenarioType } from '../../types';

interface Props {
  missionOpen: boolean;
  activeMissionScenario: MissionScenarioType | null;
  lang: 'en' | 'es';
}

export function MissionCinematicCue({ missionOpen, activeMissionScenario, lang }: Props) {
  const cueCounter = useRef(0);
  const [cue, setCue] = useState<{ key: number; data: MissionScenario } | null>(null);

  const activeData = useMemo(() => {
    if (!missionOpen) return null;
    const scenarios = getMissionScenarios(lang);
    const first = Object.values(scenarios)[0];
    return activeMissionScenario ? scenarios[activeMissionScenario] ?? first : first;
  }, [missionOpen, activeMissionScenario, lang]);

  useEffect(() => {
    if (!missionOpen || !activeData) {
      setCue(null);
      return;
    }
    cueCounter.current += 1;
    setCue({ key: cueCounter.current, data: activeData });
    const timer = window.setTimeout(() => setCue(null), 4200);
    return () => window.clearTimeout(timer);
  }, [missionOpen, activeData]);

  if (!cue) return null;
  const cueData = cue.data;

  return (
    <div key={cue.key} className={`mission-cue mission-cue-${cueData.riskSignal?.level ?? 'low'}`} aria-hidden="true">
      <div className="mission-cue-reticle" />
      <div className="mission-cue-copy">
        <span>{t('mission_sequence_kicker')}</span>
        <strong>{cueData.title}</strong>
        <div className="mission-cue-meta">
          <b>{cueData.visibleCount.toLocaleString()}</b>
          <i>{cueData.riskSignal?.level.toUpperCase() ?? t('risk_low')}</i>
        </div>
        <div className="mission-cue-steps">
          <em>{t('mission_sequence_lock')}</em>
          <em>{t('mission_sequence_sgp4')}</em>
          <em>{t('mission_sequence_ready')}</em>
        </div>
      </div>
    </div>
  );
}
