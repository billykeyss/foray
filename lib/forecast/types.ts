import type { DailyWeather } from "../weather";
import type { Forageable } from "../forageable";

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

/** Uniform card shape every engine emits, so the Today page renders them alike. */
export interface RankedItem {
  id: string;
  kind: Kind;
  item: Forageable;
  score: number; // 0–100, comparable within a kind
  label: string;
  note?: string;
  href: string;
}

export interface Forecaster {
  kind: Kind;
  title: string;
  emptyState: string;
  suggest(env: ForageEnv, regionTerms: string[] | null): RankedItem[];
}
