// ============================================================
// OrbitIQ — Satellite detail / inspection panel
// ============================================================
import { useEffect, useState } from 'react';
import { t } from '../../i18n/i18n';
import { GROUPS } from '../../data/groups';
import { bandFromAltitude } from '../../data/groups';
import { OBJECT_CLASS_META } from '../../data/objectClass';
import { inspect, dataAgeDays } from '../../orbital/propagator';
import { regionOf } from '../../regions/regions';
import { satelliteRelevance } from '../../intelligence/relevance';
import { CS } from '../../state/catalogStore';
import { useStore } from '../../state/store';
import { useUserStore } from '../../state/userStore';

const BAND_FULL: Record<string, string> = {
  LEO: 'Low Earth Orbit', MEO: 'Medium Earth Orbit', GEO: 'Geostationary',
};

interface LiveData {
  alt: number; speed: number; lat: number; lon: number; region: string; band: string;
}

interface ProximityEntry {
  idx: number;
  distKm: number;
}

interface Props {
  onClose: () => void;
  onToggleTrack: () => void;
}

export function DetailPanel({ onClose, onToggleTrack }: Props) {
  const { selected, tracking, dataMode, simMode, lang } = useStore();
  const { watchlists, addToWatchlist, removeFromWatchlist } = useUserStore();
  
  const [live, setLive] = useState<LiveData | null>(null);
  const [sim, setSim] = useState<LiveData | null>(null);
  const [proximity, setProximity] = useState<ProximityEntry[]>([]);

  // Subscribe to proximity data from catalog store
  useEffect(() => {
    if (selected < 0) { setProximity([]); return; }
    const id = setInterval(() => {
      setProximity(CS.proximity ? [...CS.proximity] : []);
    }, 1000);
    return () => clearInterval(id);
  }, [selected]);

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
  const objClass = CS.objectClass[selected] ?? 'active_payload';
  const classMeta = OBJECT_CLASS_META[objClass];

  const epochDate = new Date((rec.jdsatepoch - 2440587.5) * 86400000);
  const age       = dataAgeDays(rec, new Date());
  const ageTxt    = age < 1
    ? `${(age * 24).toFixed(1)} ${t('hours')}`
    : `${age.toFixed(2)} ${t('days')}`;

  const srcLabel = dataMode === 'live' ? t('prov_live')
    : dataMode === 'mixed' ? t('prov_mixed')
    : c.isReal ? t('d_real') : t('d_synth');

  return (
    <aside className="detail glass" id="detail">
      <button className="detail-close" onClick={onClose} aria-label="Close">×</button>

      <div className="detail-cat-row">
        <div
          className="detail-cat"
          style={{ '--c': m.color, '--c-bg': m.color + '22' } as React.CSSProperties}
        >{m.label}</div>
        <div
          className="detail-cat detail-objclass"
          style={{ '--c': classMeta.color, '--c-bg': classMeta.color + '22' } as React.CSSProperties}
          title={t('d_objclass')}
        >{t(classMeta.labelKey)}</div>
      </div>

      <h2 className="detail-name">{c.name}</h2>
      <div className="detail-id">NORAD <span>{c.satnum}</span></div>

      <div className="detail-grid">
        {simMode !== 'live' && sim && live && (
          <div className="sim-comparison">
            <div style={{color: 'var(--yellow)', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: '0.5rem'}}>
              <b>{t('current_vs_simulated_position')}:</b><br />
              {t('current_position_label')}: {live.lat.toFixed(2)}°, {live.lon.toFixed(2)}° ({live.region})<br />
              {t('simulated_position_label')}: {sim.lat.toFixed(2)}°, {sim.lon.toFixed(2)}° ({sim.region})
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

      <div className="detail-track" style={{ display: 'flex', gap: '8px' }}>
        <button className={tracking ? 'on' : ''} onClick={onToggleTrack} style={{ flex: 1 }}>
          {tracking ? t('untrack') : t('track')}
        </button>
        {(() => {
          const inWatchlist = watchlists.some(w => w.satnum === c.satnum);
          return (
            <button 
              className={inWatchlist ? 'on' : ''} 
              onClick={() => {
                if (inWatchlist) {
                  removeFromWatchlist(c.satnum);
                } else {
                  addToWatchlist({
                    name: c.name,
                    satnum: c.satnum,
                    group: grp,
                    band: (simMode !== 'live' ? sim?.band : live?.band) ?? 'LEO',
                    alt: (simMode !== 'live' ? sim?.alt : live?.alt) ?? 0,
                    region: (simMode !== 'live' ? sim?.region : live?.region) ?? 'Unknown',
                    sourceMode: dataMode
                  });
                }
              }}
              style={{ flex: 1 }}
            >
              {inWatchlist ? `🔖 ${t('watchlist_in')}` : `🔖 ${t('watchlist_add')}`}
            </button>
          );
        })()}
      </div>

      <div className="detail-source">
        <b>{t('d_source')}:</b> {srcLabel}
      </div>

      {proximity.length > 0 && (
        <div className="detail-proximity">
          <div className="dcell-k" style={{ marginBottom: '6px' }}>
            <span style={{ color: 'var(--amber)', marginRight: '5px' }}>⚠</span>
            {lang === 'es' ? 'Satélites cercanos (análisis básico)' : 'Nearby satellites (basic analysis)'}
          </div>
          {proximity.map((p) => {
            const neighbor = CS.catalog[p.idx];
            if (!neighbor) return null;
            const distColor = p.distKm < 100 ? 'var(--danger)' : p.distKm < 500 ? 'var(--amber)' : 'var(--muted)';
            return (
              <div key={p.idx} className="proximity-row">
                <span className="proximity-name">{neighbor.name}</span>
                <span className="proximity-dist" style={{ color: distColor }}>
                  {p.distKm < 1000 ? `${p.distKm} km` : `${(p.distKm / 1000).toFixed(1)}k km`}
                </span>
              </div>
            );
          })}
          <div style={{ fontSize: '8px', color: 'var(--muted)', marginTop: '4px' }}>
            {lang === 'es'
              ? 'Solo para conciencia situacional — no es evaluación de conjunciones operacional.'
              : 'For situational awareness only — not an operational conjunction assessment.'}
          </div>
        </div>
      )}
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
