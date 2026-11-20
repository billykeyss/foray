/** Last Forage Finder result, kept in localStorage so reopening offline shows it (labelled with its time). */
import { haversineKm } from "./geo.ts";
import type { FindResult } from "./run.ts";

export const FIND_KEY = "foray.find.v1";

/** Tolerant parse: anything that isn't a v1 result with a spots array is dropped, never throws. */
export function parseStoredFind(raw: string | null): FindResult | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || typeof v.speciesId !== "string" || !Array.isArray(v.spots) || typeof v.at !== "string") return null;
    if (!v.center || !Number.isFinite(v.center.lat) || !Number.isFinite(v.center.lon)) return null;
    return v as FindResult;
  } catch {
    return null;
  }
}

export function loadStoredFind(): FindResult | null {
  try {
    return parseStoredFind(localStorage.getItem(FIND_KEY));
  } catch {
    return null;
  }
}

export function saveStoredFind(r: FindResult): void {
  try {
    localStorage.setItem(FIND_KEY, JSON.stringify(r));
  } catch {
    /* quota / private mode: the result just isn't kept */
  }
}

/** Only full-data results are kept: a low-confidence or unavailable run must never overwrite the last good one. */
export function shouldStoreFind(r: Pick<FindResult, "status">): boolean {
  return r.status === "ok" || r.status === "poor" || r.status === "out-of-season";
}

/** Stored results within this distance of the current centre (same radius) are the same search. */
export const SAME_CENTER_KM = 3;

/** "exact": same species, centre within 3 km, same radius — safe to show as current.
 *  "other": same species but a different place or radius — show only explicitly labelled as saved.
 *  null: nothing usable. */
export function matchStored(
  stored: Pick<FindResult, "speciesId" | "center" | "radiusKm"> | null,
  q: { speciesId: string; lat: number; lon: number; radiusKm: number },
): "exact" | "other" | null {
  if (!stored || stored.speciesId !== q.speciesId) return null;
  const near = haversineKm(stored.center, { lat: q.lat, lon: q.lon }) <= SAME_CENTER_KM;
  return near && stored.radiusKm === q.radiusKm ? "exact" : "other";
}
