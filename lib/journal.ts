"use client";

import { useEffect, useState } from "react";

export interface JournalWeatherSnapshot {
  /** Current air temp in °C at time of entry */
  tempC?: number;
  /** Last-7-day cumulative precipitation in mm */
  rain7d?: number;
  /** Last-24h precipitation in mm */
  rain24h?: number;
  /** Days since last meaningful rain (>=1mm) */
  daysSinceRain?: number;
  /** Relative humidity % */
  humidityPct?: number;
  /** Spore score 0-100 at time of entry */
  score?: number;
  /** Short label ("Prime", "Fertile", etc.) */
  label?: string;
}

export interface JournalCatch {
  waterSlug?: string;
  species?: string;
  length_in?: number;
  kept: boolean;
}

export interface JournalEntry {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  /** ISO datetime captured at save (used for finer-grained ordering) */
  capturedAt?: string;
  species: string;
  location: string;
  notes: string;
  lat?: number;
  lon?: number;
  /** Base64 data URL (JPEG, compressed to ~1024px on save) */
  photoDataUrl?: string;
  /** Snapshot of conditions at time of entry */
  weather?: JournalWeatherSnapshot;
  /** Absent on legacy entries; read it with `entryKind` (absent means "find"). */
  kind?: "find" | "catch";
  catch?: JournalCatch;
  // Legacy top-level fields kept for back-compat with the original schema
  score?: number;
  rain7d?: number;
}

/** Legacy entries have no `kind`; they are finds. Stored data is never rewritten on read. */
export function entryKind(e: Pick<JournalEntry, "kind">): "find" | "catch" {
  return e.kind === "catch" ? "catch" : "find";
}

const KEY = "mycelium.journal.v1";

/** New installs start empty — no more dummy seed entries. */
const SEED: JournalEntry[] = [];

/** Strip the old hard-coded demo entries from a previously-seeded install. */
function isSeed(e: JournalEntry): boolean {
  return e.id?.startsWith("seed-") ?? false;
}

export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed: JournalEntry[] = JSON.parse(raw);
        const cleaned = parsed.filter((e) => !isSeed(e));
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(KEY, JSON.stringify(cleaned));
        }
        setEntries(cleaned);
      } else {
        setEntries(SEED);
        localStorage.setItem(KEY, JSON.stringify(SEED));
      }
    } catch {
      setEntries(SEED);
    }
    setLoaded(true);
  }, []);

  const persist = (next: JournalEntry[]) => {
    setEntries(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (err) {
      // Most common cause: localStorage quota exceeded from large photo blobs.
      // Surface a console message so the user can see why the save failed.
      console.error("journal save failed", err);
      throw err;
    }
  };

  const add = (e: Omit<JournalEntry, "id">) => {
    const entry: JournalEntry = {
      ...e,
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    persist([entry, ...entries]);
  };

  const update = (id: string, patch: Partial<Omit<JournalEntry, "id">>) => {
    persist(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const remove = (id: string) => {
    persist(entries.filter((e) => e.id !== id));
  };

  return { entries, loaded, add, update, remove };
}
