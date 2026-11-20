import { haversineKm, offsetM, type LatLon } from "./geo.ts";

/**
 * Candidate points on a square lattice inside a circle of `radiusKm`, spaced so roughly `target`
 * points fall inside (area πr² / target per point). The centre is always a lattice point.
 */
export function candidateGrid(lat: number, lon: number, radiusKm: number, target = 60): LatLon[] {
  const spacingKm = radiusKm * Math.sqrt(Math.PI / target);
  const steps = Math.floor(radiusKm / spacingKm);
  const centre = { lat, lon };
  const out: LatLon[] = [];
  for (let j = -steps; j <= steps; j++) {
    for (let i = -steps; i <= steps; i++) {
      const p = offsetM(centre, i * spacingKm * 1000, j * spacingKm * 1000);
      if (haversineKm(centre, p) <= radiusKm) out.push(p);
    }
  }
  return out;
}

/** Highest score first, skipping anything within `minKm` of an already-picked point. */
export function pickSpaced<T extends LatLon & { score: number }>(items: T[], n = 5, minKm = 2): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const out: T[] = [];
  for (const it of sorted) {
    if (out.length >= n) break;
    if (out.some((o) => haversineKm(o, it) < minKm)) continue;
    out.push(it);
  }
  return out;
}
