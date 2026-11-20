/** Last Forage Finder result, kept in localStorage so reopening offline shows it (labelled with its time). */
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
