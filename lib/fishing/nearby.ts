import { FISH_WATERS } from "./waters-index.ts";
import type { WaterSummary } from "./types.ts";

const EARTH_RADIUS_MI = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

/** Up to `n` waters within `maxMi` miles, nearest first. */
export function nearestWaters(
  lat: number,
  lon: number,
  n: number,
  maxMi = 50,
): Array<WaterSummary & { distanceMi: number }> {
  return FISH_WATERS.map((w) => ({ ...w, distanceMi: haversineMi(lat, lon, w.lat, w.lon) }))
    .filter((w) => w.distanceMi <= maxMi)
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, n);
}
