// ============================================================
// OrbitIQ — Satellite detail / inspection panel
// ============================================================
import { useEffect, useState } from 'react';
import { t } from '../../i18n/i18n';
import { GROUPS } from '../../data/groups';
import { bandFromAltitude } from '../../data/groups';
import { inspect, dataAgeDays } from '../../orbital/propagator';
import { regionOf } from '../../regions/regions';
import { satelliteRelevance } from '../../ai/agent';
import { CS } from '../../state/catalogStore';
import { useStore } from '../../state/store';

const BAND_FULL: Record<string, string> = {
  LEO: 'Low Earth Orbit', MEO: 'Medium Earth Orbit', GEO: 'Geostationary',
};

interface LiveData {
  alt: number; speed: number; lat: number; lon: number; region: string; band: string;
}

interface Props {
  onClose: () => void;
  onToggleTrack: () => void;
}

export function DetailPanel({ onClose, onToggleTrack }: Props) {
  const { selected, tracking, dataMode, simMode } = useStore();
  const [live, setLive] = useState<LiveData | null>(null);
  const [sim, setSim] = useState<LiveData | null>(null);

  useEffect(() => {
    if (selected < 0) { setLive(null); return; }
    const refresh = () => {
      const rec = CS.recs[selected];
      const infoLive = inspect(rec, new Date());
      if (infoLive) {
        setLive({
          alt: infoLive.alt, speed: infoLive.speed,
          lat: infoLive.lat, lon: infoLive.lon,
          region: regionOf(infoLive.lat, infoLive.lon),
          band: bandFromAltitude(infoLive.alt),
        });
      }
      
      if (useStore.getState().simMode !== 'live') {
        const infoSim = inspect(rec, new Date(CS.simTimestampMs));
        if (infoSim) {
          setSim({
            alt: infoSim.alt, speed: infoSim.speed,
            lat: infoSim.lat, lon: infoSim.lon,
            region: regionOf(infoSim.lat, infoSim.lon),
            band: bandFromAltitude(infoSim.alt),
          });
        }
      } else {
        setSim(null);
      }
    };
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [selected]);

  if (selected < 0) return null;

  // Bounds guard: catalog may not yet be loaded or index stale after reload
  const c  = CS.catalog[selected];
  const rec = CS.recs[selected];
  if (!c || !rec) return null;

  const grp = CS.group[selected] ?? 'other';
  const m  = GROUPS[grp] ?? GROUPS['other'];

  const epochDate = new Date((rec.jdsatepoch - 2440587.5) * 86400000);
  const age       = dataAgeDays(rec, new Date());
  const ageTxt    = age < 1
    ? `${(age * 24).toFixed(1)} ${t('hours')}`
    : `${age.toFixed(2)} ${t('days')}`;

  const srcLabel = dataMode === 'live' ? t('prov_live')
    : c.isReal ? t('d_real') : t('d_synth');

  return (
    <aside className="detail glass" id="detail">
      <button className="detail-close" onClick={onClose} aria-label="Close">×</button>

      <div
        className="detail-cat"
        style={{ '--c': m.color, '--c-bg': m.color + '22' } as React.CSSProperties}
      >{m.label}</div>

      <h2 className="detail-name">{c.name}</h2>
      <div className="detail-id">NORAD <span>{c.satnum}</span></div>

      <div className="detail-grid">
        {simMode !== 'live' && sim && live && (
          <div className="sim-comparison">
            <div style={{color: 'var(--yellow)', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: '0.5rem'}}>
              <b>Current vs Simulated Position:</b><br />
              Live: {live.lat.toFixed(2)}°, {live.lon.toFixed(2)}° ({live.region})<br />
              Sim: {sim.lat.toFixed(2)}°, {sim.lon.toFixed(2)}° ({sim.region})
            </div>
          </div>
        )}
        {(simMode !== 'live' ? sim : live) && (() => {
          const data = simMode !== 'live' ? sim : live;
          if (!data) return null;
          return (
            <>
              <Cell k="d_class" wide>
                {BAND_FULL[data.band] ?? data.band} <small>({data.band})</small>
              </Cell>
              <Cell k="d_alt"><span className="live">{Math.round(data.alt).toLocaleString()} km</span></Cell>
              <Cell k="d_speed"><span className="live">{data.speed.toFixed(2)} km/s</span></Cell>
              <Cell k="d_lat"><span className="live">{data.lat.toFixed(2)}°</span></Cell>
              <Cell k="d_lon"><span className="live">{data.lon.toFixed(2)}°</span></Cell>
              <Cell k="d_region" wide><span className="live">{data.region}</span></Cell>
            </>
          );
        })()}
        <Cell k="d_epoch">{epochDate.toISOString().slice(0, 16).replace('T', ' ')}Z</Cell>
        <Cell k="d_age">{ageTxt}</Cell>
        <Cell k="d_vis"><span style={{ color: 'var(--green)' }}>● {t('vis_tracking')}</span></Cell>
      </div>

      <div className="detail-relevance">
        <div className="dcell-k"><span className="ai-dot" /><span>{t('d_relevance')}</span></div>
        <p>{satelliteRelevance(grp)}</p>
      </div>

      <div className="detail-track">
        <button className={tracking ? 'on' : ''} onClick={onToggleTrack}>
          {tracking ? t('untrack') : t('track')}
        </button>
      </div>

      <div className="detail-source">
        <b>{t('d_source')}:</b> {srcLabel}
      </div>
    </aside>
  );
}

function Cell({ k, children, wide }: { k: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`dcell${wide ? ' wide' : ''}`}>
      <div className="dcell-k">{t(k)}</div>
      <div className="dcell-v">{children}</div>
    </div>
  );
}
