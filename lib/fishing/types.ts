import type { CandidateRule, ReachInfo } from "./engine/index.ts";

export interface WaterSummary {
  slug: string;
  name: string;
  waterType: string;
  states: string[];
  lon: number;
  lat: number;
  verifyCurrent: boolean;
  species: string[];
}

/** Field names match the `stocking.events[]` entries of Keeper's GET /api/waters/:id/rules. */
export interface StockingEvent {
  species: string;
  quantity: number | null;
  sizeNote: string | null;
  date: string;
  sourceUrl: string | null;
}

/** Field names match the `stocking.schedule[]` entries of Keeper's GET /api/waters/:id/rules. */
export interface StockingSchedule {
  species: string;
  frequency: string;
  seasonStartMonth: number | null;
  seasonEndMonth: number | null;
  note: string;
  sourceUrl: string | null;
}

export interface WaterDataset {
  slug: string;
  asOf: string;
  water: WaterSummary & { counties: string[] };
  candidates: CandidateRule[];
  reaches: ReachInfo[];
  reciprocity: Array<{
    honoringAuthority: string;
    honoredAuthority: string | null;
    honored: boolean;
    replacesStateLicense: boolean;
    condition: Record<string, unknown> | null;
  }>;
  species: Array<{ commonName: string; scientificName: string | null; category: string; presence: string }>;
  stocking: { events: StockingEvent[]; schedule: StockingSchedule[] };
}
