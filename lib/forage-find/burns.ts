/** Burn-scar lookups over public/data/burns.geojson (NIFC perimeters: name, year, acres). Pure. */
import { haversineKm, type LatLon } from "./geo.ts";

type Ring = number[][];
export type BurnGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] }
  | { type: string; coordinates?: unknown };

export interface BurnFeature {
  type?: string;
  properties: Record<string, unknown> | null;
  geometry: BurnGeometry | null;
}
export interface BurnCollection {
  type?: string;
  features: BurnFeature[];
}

export interface BurnHit {
  name: string;
  year: number;
  /** Calendar years since the fire (0 = burned this year). */
  ageYears: number;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, rings: Ring[]): boolean {
  if (!rings.length || !inRing(x, y, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) if (inRing(x, y, rings[h])) return false;
  return true;
}

export function pointInGeometry(lon: number, lat: number, g: BurnGeometry | null): boolean {
  if (!g) return false;
  if (g.type === "Polygon") return inPolygon(lon, lat, g.coordinates as Ring[]);
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).some((p) => inPolygon(lon, lat, p));
  return false;
}

function bbox(g: BurnGeometry | null): [number, number, number, number] | null {
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys)
    for (const [x, y] of p[0] ?? []) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

function fire(f: BurnFeature): { name: string; year: number } | null {
  const year = Number(f.properties?.year);
  if (!Number.isFinite(year)) return null;
  return { name: String(f.properties?.name || "Unnamed fire").trim(), year };
}

/** The most recent fire whose perimeter contains the point, with its age. */
export function burnAt(lat: number, lon: number, fc: BurnCollection | null, nowYear: number): BurnHit | null {
  if (!fc) return null;
  let best: BurnHit | null = null;
  for (const f of fc.features) {
    const info = fire(f);
    if (!info || (best && info.year <= best.year)) continue;
    if (pointInGeometry(lon, lat, f.geometry)) best = { ...info, ageYears: nowYear - info.year };
  }
  return best;
}

/**
 * A few interior sample points per fire burned within the last `maxAge` years whose interior lies
 * within `radiusKm` of the centre: extra candidates for burn-loving species (morels).
 */
export function burnInteriorPoints(
  fc: BurnCollection | null,
  lat: number,
  lon: number,
  radiusKm: number,
  nowYear: number,
  maxAge = 3,
  max = 20,
): (LatLon & BurnHit)[] {
  if (!fc) return [];
  const centre = { lat, lon };
  const out: (LatLon & BurnHit)[] = [];
  const recent = fc.features
    .map((f) => ({ f, info: fire(f), box: bbox(f.geometry) }))
    .filter((r) => r.info && r.box && nowYear - r.info.year <= maxAge && nowYear - r.info.year >= 0)
    .sort((a, b) => b.info!.year - a.info!.year);
  for (const { f, info, box } of recent) {
    if (out.length >= max) break;
    const [x0, y0, x1, y1] = box!;
    const mid = { lat: (y0 + y1) / 2, lon: (x0 + x1) / 2 };
    const halfDiagKm = haversineKm({ lat: y0, lon: x0 }, { lat: y1, lon: x1 }) / 2;
    if (haversineKm(centre, mid) - halfDiagKm > radiusKm) continue;
    // 5×5 lattice over the bbox; keep up to 3 interior points within the radius.
    let kept = 0;
    for (let j = 1; j <= 5 && kept < 3; j++)
      for (let i = 1; i <= 5 && kept < 3; i++) {
        const p = { lat: y0 + ((y1 - y0) * j) / 6, lon: x0 + ((x1 - x0) * i) / 6 };
        if (haversineKm(centre, p) > radiusKm || !pointInGeometry(p.lon, p.lat, f.geometry)) continue;
        if (burnAt(p.lat, p.lon, fc, nowYear)?.year !== info!.year) continue;
        out.push({ ...p, name: info!.name, year: info!.year, ageYears: nowYear - info!.year });
        kept++;
      }
  }
  return out.slice(0, max);
}
