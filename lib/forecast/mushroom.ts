import { computeSporeScore, suggestSpeciesList } from "../weather.ts";
import type { Forecaster, RankedItem } from "./types";

/** Thin adapter over the existing rain-flush engine — no scoring change. Exists
 *  so the registry has a uniform shape; the Today page still renders mushrooms
 *  with its flagship SporeGauge, not this generic card. */
export const mushroomForecaster: Forecaster = {
  kind: "mushroom",
  title: "Mushrooms flushing",
  emptyState: "No likely mushroom flush near you today.",
  suggest: (env, regionTerms) => {
    if (!env.weather.length) return [];
    const reading = computeSporeScore(env.weather);
    return suggestSpeciesList(reading, regionTerms, 6).map((s): RankedItem => ({
      id: s.id,
      kind: "mushroom",
      item: s,
      score: reading.score,
      label: `Day ${reading.daysSinceRain} after rain`,
      href: `/catalog/${s.id}`,
    }));
  },
};
