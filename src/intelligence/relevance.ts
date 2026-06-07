import { GROUPS } from '../data/groups';
import type { GroupKey } from '../types';

const RELEVANCE_EN: Record<string, string> = {
  starlink: 'Commercial LEO broadband object — part of a very large active constellation; contributes to analytical density in the 540-570 km shells.',
  stations: 'Crewed orbital platform — high public-interest object represented through public TLE propagation.',
  gnss: 'Positioning, navigation & timing payload — critical infrastructure underpinning finance, logistics and defense timing.',
  weather: 'Environmental monitoring asset — feeds meteorology, climate and early-warning systems.',
  science: 'Earth-observation / science platform — imaging, mapping and research utility.',
  geo: 'Geostationary communications asset — fixed over its sub-longitude for broadcast, data relay and backhaul.',
  meo: 'Medium-orbit communications / navigation asset.',
  leo: 'Low-Earth-orbit object — short revisit time, part of the most populated public TLE band.',
  other: 'Tracked orbital object.',
};

const RELEVANCE_ES: Record<string, string> = {
  starlink: 'Objeto de banda ancha comercial LEO: parte de una constelación activa muy grande; aporta densidad analítica en las órbitas de 540-570 km.',
  stations: 'Plataforma orbital tripulada: objeto de alto interés público representado mediante propagación TLE pública.',
  gnss: 'Carga útil de posicionamiento, navegación y sincronización (PNT): infraestructura crítica que respalda las finanzas, la logística y la sincronización de la defensa.',
  weather: 'Activo de monitoreo ambiental: alimenta sistemas de meteorología, clima y alerta temprana.',
  science: 'Plataforma de investigación / observación terrestre: utilidad de imágenes, cartografía e investigación.',
  geo: 'Activo de comunicaciones geoestacionario: fijo sobre su longitud para transmisiones, retransmisión de datos y enlaces de retroceso.',
  meo: 'Activo de navegación / comunicaciones en órbita terrestre media.',
  leo: 'Objeto en órbita terrestre baja: tiempo de paso corto, parte de la banda TLE pública más poblada.',
  other: 'Objeto orbital rastreado.',
};

export function satelliteRelevance(group: GroupKey, lang: 'en' | 'es' = 'en'): string {
  const dict = lang === 'es' ? RELEVANCE_ES : RELEVANCE_EN;
  return dict[group] ?? dict['other'];
}

export function groupLabel(group: GroupKey): string {
  return (GROUPS[group] ?? GROUPS['other']).label;
}
