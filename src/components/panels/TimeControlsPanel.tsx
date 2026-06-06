import { useEffect, useState, useRef } from 'react';
import { useStore } from '../../state/store';
import { CS } from '../../state/catalogStore';
import { t } from '../../i18n/i18n';

function formatOffset(ms: number): string {
  const diff = ms - Date.now();
  if (Math.abs(diff) < 1000) return t('live_mode') || 'Live';
  
  const sign = diff < 0 ? '-' : '+';
  const absS = Math.floor(Math.abs(diff) / 1000);
  const h = Math.floor(absS / 3600);
  const m = Math.floor((absS % 3600) / 60);
  const s = absS % 60;
  
  if (h > 0) return `${sign}${h}h ${m}m`;
  if (m > 0) return `${sign}${m}m ${s}s`;
  return `${sign}${s}s`;
}

function formatSimTime(ms: number): string {
  const d = new Date(ms - 6 * 3600 * 1000);
  // Example format: YYYY-MM-DD HH:MM:SS UTC-6
  return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC-6';
}

export function TimeControlsPanel() {
  const { simMode, simSpeed, setSimMode, setSimSpeed, jumpTime, resetTime } = useStore();
  const [displayTime, setDisplayTime] = useState<string>('');
  const [displayOffset, setDisplayOffset] = useState<string>('');
  
  // Fast clock sync (decoupled from React states that trigger app-wide re-renders)
  const reqRef = useRef<number>();
  
  useEffect(() => {
    function tick() {
      setDisplayTime(formatSimTime(CS.simTimestampMs));
      setDisplayOffset(formatOffset(CS.simTimestampMs));
      reqRef.current = requestAnimationFrame(tick);
    }
    reqRef.current = requestAnimationFrame(tick);
    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, []);

  const speeds = [0.25, 0.5, 1, 5, 10, 60, 360];

  const handleTogglePlay = () => {
    if (simMode === 'paused') setSimMode(simSpeed === 1 ? 'live' : 'simulating');
    else setSimMode('paused');
  };

  const isLive = simMode === 'live' && Math.abs(CS.simTimestampMs - Date.now()) < 1000;

  return (
    <div className="time-controls-panel glass-panel">
      <div className="time-header">
        <div className="time-status-badge">
          {simMode === 'live' && <span className="status-dot live" />}
          {simMode === 'paused' && <span className="status-dot paused" />}
          {simMode === 'simulating' && <span className="status-dot sim" />}
          <span className="mode-label">
            {simMode === 'live' ? (t('live') || 'Live') : 
             simMode === 'paused' ? (t('paused') || 'Paused') : 
             (t('simulated') || 'Simulated')}
          </span>
          {simMode === 'simulating' && <span className="speed-badge">{simSpeed}x</span>}
        </div>
        <div className="time-offset">{!isLive && displayOffset}</div>
      </div>
      
      <div className="time-display">{displayTime}</div>
      
      {!isLive && (
        <div className="time-caveat">
          {t('simulation_caveat') || 'Scenario simulation uses SGP4 propagation. Accuracy degrades away from TLE epoch. Not for aerospace decisions.'}
        </div>
      )}

      <div className="time-actions">
        <button className="time-btn" onClick={() => jumpTime(-3600000)} title="-1 Hour">
          -1h
        </button>
        <button className="time-btn" onClick={() => jumpTime(-600000)} title="-10 Minutes">
          -10m
        </button>
        
        <button className="time-btn play-pause" onClick={handleTogglePlay}>
          {simMode === 'paused' ? '▶' : '⏸'}
        </button>
        
        <button className="time-btn" onClick={() => jumpTime(600000)} title="+10 Minutes">
          +10m
        </button>
        <button className="time-btn" onClick={() => jumpTime(3600000)} title="+1 Hour">
          +1h
        </button>
      </div>

      <div className="speed-controls">
        <span className="speed-label">{t('time_speed') || 'Speed:'}</span>
        <div className="speed-options">
          {speeds.map(s => (
            <button 
              key={s} 
              className={`speed-pill ${simSpeed === s ? 'active' : ''}`}
              onClick={() => {
                setSimSpeed(s);
                if (simMode !== 'paused') setSimMode(s === 1 ? 'live' : 'simulating');
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {!isLive && (
        <button className="reset-time-btn" onClick={() => resetTime()}>
          {t('reset_to_now') || 'Reset to Now'}
        </button>
      )}
    </div>
  );
}
