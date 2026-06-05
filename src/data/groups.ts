// ============================================================
// OrbitIQ — group metadata & satellite classifier
// ============================================================
import type { GroupKey, GroupMetaMap } from '../types';

export const GROUPS: GroupMetaMap = {
  starlink: { label: 'Starlink',  color: '#4cc9f0' },
  stations: { label: 'Stations',  color: '#ff5d8f' },
  leo:      { label: 'LEO',       color: '#7aa2ff' },
  meo:      { label: 'MEO',       color: '#b388ff' },
  geo:      { label: 'GEO',       color: '#ffd166' },
  gnss:     { label: 'GNSS',      color: '#06d6a0' },
  weather:  { label: 'Weather',   color: '#84dcc6' },
  science:  { label: 'Science',   color: '#f4a261' },
  other:    { label: 'Other',     color: '#8d99ae' },
};

export function classifyGroup(name: string, altKm: number): GroupKey {
  const u = name.toUpperCase();
  if (/STARLINK/.test(u)) return 'starlink';
  if (/ISS|ZARYA|TIANHE|CSS|CREW|SOYUZ|TIANGONG/.test(u)) return 'stations';
  if (/GPS|GALILEO|GLONASS|BEIDOU|NAVSTAR|IRNSS|QZS/.test(u)) return 'gnss';
  if (/NOAA|GOES|METOP|METEOR|DMSP|FENGYUN|FY-|HIMAWARI/.test(u)) return 'weather';
  if (/HUBBLE|HST|LANDSAT|SENTINEL|TERRA|AQUA|WORLDVIEW/.test(u)) return 'science';
  if (altKm > 35000) return 'geo';
  if (altKm > 2000) return altKm > 30000 ? 'geo' : 'meo';
  return 'leo';
}

export function bandFromAltitude(altKm: number): 'LEO' | 'MEO' | 'GEO' {
  if (altKm < 2000) return 'LEO';
  if (altKm < 35000) return 'MEO';
  return 'GEO';
}

export const GROUP_ORDER: GroupKey[] = [
  'starlink', 'leo', 'meo', 'geo', 'gnss', 'weather', 'stations', 'science',
];
