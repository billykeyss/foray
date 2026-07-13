import type { DailyWeather } from "../weather";

export type Kind = "mushroom" | "plant" | "shellfish";

/** Everything an engine might read. Each engine pulls only what it needs.
 *  `now` is injected (never read from a global clock inside engines) so scoring
 *  is deterministic and unit-testable. */
export interface ForageEnv {
  weather: DailyWeather[];
  now: Date;
  lat: number;
  lon: number;
}

/** The display fields the Today cards need. Every catalog entry — mushroom,
 *  plant, or ocean — satisfies this, even though ocean species don't extend
 *  `Forageable`. Cards downcast `item` to the concrete type for kind-specific
 *  bits (emoji, edibility chip). */
export interface RankedRef {
  id: string;
  commonNames: string[];
  scientific: string;
  regionsPNW: string[];
}

/** Uniform card shape every engine emits, so the Today page renders them alike. */
export interface RankedItem {
  id: string;
  kind: Kind;
  item: RankedRef;
  score: number; // 0–100, comparable within a kind
  label: string;
  note?: string;
  /** a safety line the card must foreground (e.g. shellfish biotoxin closures) */
  warn?: string;
  href: string;
}

export interface Forecaster {
  kind: Kind;
  title: string;
  emptyState: string;
  /** in-region, in-season items ranked for right now */
  suggest(env: ForageEnv, regionTerms: string[] | null): RankedItem[];
  /** whether this kind occurs in the selected region at all (ignoring season),
   *  so the Today page can hide an inapplicable section vs. show "out of season".
   *  Defaults to always-applicable when omitted. */
  hasRegionCoverage?(regionTerms: string[] | null): boolean;
}
