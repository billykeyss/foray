import type { PlantSpecies } from "./plant-types";
import { EDIBLE_PLANTS } from "./plant-catalog.ts";
import { speciesInRegions } from "./region-filter.ts";
import type { ForageEnv, RankedItem } from "./forecast/types";

/** Tahoe–Truckee montane (~1900 m) monthly mean air temp (°C). Coarse baseline
 *  for the early/late-spring nudge only — NOT a climate model. Index 0 = Jan. */
export const MONTHLY_NORMAL_C = [-3, -1, 1, 4, 8, 12, 16, 15, 12, 7, 1, -2];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface PlantSeasonReading {
  score: number;
  inSeason: boolean;
  peak: boolean;
  label: string;
  note?: string;
}

/** Score a plant's harvest-readiness for the current month. Calendar-driven
 *  (peak > shoulder > out) with a small ± temperature nudge for an early/late
 *  spring. No rain/humidity terms — plants are seasonal, not rain-flush. */
export function scorePlant(plant: PlantSpecies, env: ForageEnv): PlantSeasonReading {
  const month = env.now.getMonth() + 1;
  const inSeason = plant.harvestMonths.includes(month);
  const peak = plant.peakMonths.includes(month);
  if (!inSeason) return { score: 0, inSeason: false, peak: false, label: "Out of season" };

  const base = peak ? 85 : 60;
  let nudge = 0;
  let note: string | undefined;
  if (plant.seasonCue.tempSensitive && env.weather.length) {
    const recentMean = env.weather.reduce((s, d) => s + d.tempMean, 0) / env.weather.length;
    const anomaly = recentMean - MONTHLY_NORMAL_C[month - 1];
    nudge = clamp(Math.round(anomaly * 3), -12, 15); // asymmetric: warmth advances more than cold retards
    if (!peak && nudge >= 6) note = "Early — warm spell";
    else if (!peak && nudge <= -6) note = "Later — cool spell";
  }
  return { score: clamp(base + nudge, 0, 100), inSeason, peak, label: peak ? "Peak now" : "In season", note };
}

/** In-region, in-season edible plants ranked by seasonal readiness. Iterates
 *  EDIBLE_PLANTS (never PLANT_CATALOG) so deadly/toxic warning entries — which
 *  carry empty harvestMonths — can never surface here. */
export function suggestPlants(
  env: ForageEnv,
  regionTerms: string[] | null,
  limit = 6,
): RankedItem[] {
  return EDIBLE_PLANTS
    .filter((p) => speciesInRegions(p, regionTerms))
    .map((p) => ({ p, r: scorePlant(p, env) }))
    .filter(({ r }) => r.inSeason)
    .sort((a, b) => b.r.score - a.r.score)
    .slice(0, limit)
    .map(({ p, r }): RankedItem => ({
      id: p.id,
      kind: "plant",
      item: p,
      score: r.score,
      label: r.label,
      note: r.note,
      href: `/plants/${p.id}`,
    }));
}
