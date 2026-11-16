"use client";

import { useCallback, useEffect, useState } from "react";
import { nearestWaters } from "./fishing/nearby.ts";

export type SpotKind = "forage" | "fish" | "both";

export interface SavedSpot {
  id: string;
  lon: number;
  lat: number;
  label: string;
  kind: SpotKind;
  createdAt: string;
}

export const SAVED_SPOTS_KEY = "foray.saved-spots.v1";
const KINDS = new Set(["forage", "fish", "both"]);

/** Tolerant parse of the stored JSON: drops malformed rows, never throws. */
export function parseSpots(raw: string | null): SavedSpot[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (s): s is SavedSpot =>
        s && typeof s.id === "string" && Number.isFinite(s.lon) && Number.isFinite(s.lat) &&
        typeof s.label === "string" && KINDS.has(s.kind),
    );
  } catch {
    return [];
  }
}

/** "fish" when a known water is within ~0.25 mi of the point, otherwise "both". */
export function defaultSpotKind(lat: number, lon: number): SpotKind {
  return nearestWaters(lat, lon, 1, 0.25).length ? "fish" : "both";
}

export function useSavedSpots() {
  const [spots, setSpots] = useState<SavedSpot[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setSpots(parseSpots(localStorage.getItem(SAVED_SPOTS_KEY)));
    } catch {}
    setLoaded(true);
  }, []);

  const persist = useCallback((next: SavedSpot[]) => {
    setSpots(next);
    try {
      localStorage.setItem(SAVED_SPOTS_KEY, JSON.stringify(next));
    } catch (err) {
      console.error("saved spots save failed", err);
    }
  }, []);

  const add = useCallback(
    (s: Omit<SavedSpot, "id" | "createdAt">): SavedSpot => {
      const spot: SavedSpot = { ...s, id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() };
      persist([spot, ...spots]);
      return spot;
    },
    [spots, persist],
  );
  const remove = useCallback((id: string) => persist(spots.filter((s) => s.id !== id)), [spots, persist]);

  return { spots, loaded, add, remove };
}
