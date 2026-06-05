// ============================================================
// OrbitIQ — region matcher
// Coarse lat/lon bounding boxes for "which satellites are over X?"
// ============================================================
import type { RegionMap } from '../types';

export const REGIONS: RegionMap = {
  japan:         { label: 'Japan',           box: [24, 46, 122, 146],   center: [36, 138] },
  latam:         { label: 'Latin America',   box: [-56, 33, -118, -34], center: [-15, -60] },
  north_america: { label: 'North America',   box: [15, 72, -168, -52],  center: [45, -100] },
  europe:        { label: 'Europe',          box: [35, 71, -25, 45],    center: [54, 15] },
  africa:        { label: 'Africa',          box: [-35, 37, -18, 52],   center: [2, 20] },
  middle_east:   { label: 'Middle East',     box: [12, 42, 34, 63],     center: [27, 48] },
  south_asia:    { label: 'South Asia',      box: [5, 37, 60, 97],      center: [22, 79] },
  east_asia:     { label: 'East Asia',       box: [18, 53, 97, 146],    center: [35, 115] },
  sea:           { label: 'Southeast Asia',  box: [-11, 23, 92, 141],   center: [5, 115] },
  oceania:       { label: 'Oceania',         box: [-48, -8, 110, 180],  center: [-27, 134] },
  usa:           { label: 'United States',   box: [24, 50, -125, -66],  center: [39, -98] },
  arctic:        { label: 'Arctic',          box: [66, 90, -180, 180],  center: [78, 0] },
  equator:       { label: 'Equatorial Belt', box: [-10, 10, -180, 180], center: [0, 0] },
};

function inBox(lat: number, lon: number, box: [number, number, number, number]): boolean {
  const [latMin, latMax, lonMin, lonMax] = box;
  if (lat < latMin || lat > latMax) return false;
  if (lonMin <= lonMax) return lon >= lonMin && lon <= lonMax;
  return lon >= lonMin || lon <= lonMax; // antimeridian wrap
}

export function matchRegion(lat: number, lon: number, key: string): boolean {
  const r = REGIONS[key];
  return r ? inBox(lat, lon, r.box) : false;
}

const REGION_ORDER: string[] = [
  'japan', 'usa', 'europe', 'middle_east', 'south_asia',
  'east_asia', 'sea', 'oceania', 'africa', 'latam', 'arctic',
];

export function regionOf(lat: number, lon: number): string {
  for (const k of REGION_ORDER) {
    if (inBox(lat, lon, REGIONS[k].box)) return REGIONS[k].label;
  }
  if (Math.abs(lat) < 10) return 'Equatorial ocean';
  return lat > 0 ? 'Northern ocean' : 'Southern ocean';
}
