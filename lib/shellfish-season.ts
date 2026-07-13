import type { OceanSpecies } from "./ocean-types";
import { HARVESTABLE_OCEAN } from "./ocean-catalog.ts";
import { speciesInRegions } from "./region-filter.ts";
import { springStrength } from "./lunar.ts";
import type { ForageEnv, RankedItem } from "./forecast/types";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Non-negotiable safety line on every shellfish card — biotoxin closures are
 *  invisible, dynamic, state-run, and can be lethal. We surface the *check*,
 *  never a prediction of safety. */
export const BIOTOXIN_WARN =
  "⚠ Check the current state PSP / domoic-acid closure before harvesting";

export interface ShellfishReading {
  score: number;
  inSeason: boolean;
  peak: boolean;
  label: string;
  note?: string;
  warn: string;
}

/** Does harvesting this species depend on a low tide exposing it? (Trap- or
 *  dive-caught species like Dungeness crab have no tide dependence.) */
function tideDependent(o: OceanSpecies): boolean {
  return !!o.bestTide && /low|minus|spring/i.test(o.bestTide);
}

/** Season base (peak > shoulder) plus a lunar spring-tide nudge for species a
 *  low tide has to expose. No temperature term — the moon is what matters. */
export function scoreShellfish(o: OceanSpecies, env: ForageEnv): ShellfishReading {
  const month = env.now.getMonth() + 1;
  const inSeason = o.harvestMonths.includes(month);
  const peak = o.peakMonths.includes(month);
  if (!inSeason) return { score: 0, inSeason: false, peak: false, label: "Out of season", warn: BIOTOXIN_WARN };

  const base = peak ? 85 : 60;
  let tideNudge = 0;
  let note: string | undefined;
  if (tideDependent(o)) {
    const s = springStrength(env.now); // 1 spring (new/full), 0 neap (quarter)
    tideNudge = Math.round((s - 0.5) * 24); // [-12, +12]
    note = s >= 0.6 ? "Spring low tides — good window" : s <= 0.4 ? "Neap tides — poor exposure" : "Moderate tides";
  }
  return {
    score: clamp(base + tideNudge, 0, 100),
    inSeason,
    peak,
    label: peak ? "Peak season" : "In season",
    note,
    warn: BIOTOXIN_WARN,
  };
}

/** In-region, in-season shellfish ranked by tide/season readiness. Iterates
 *  HARVESTABLE_OCEAN (never OCEAN_CATALOG) so biotoxin hazard entries can't surface. */
export function suggestShellfish(
  env: ForageEnv,
  regionTerms: string[] | null,
  limit = 6,
): RankedItem[] {
  return HARVESTABLE_OCEAN
    .filter((o) => speciesInRegions(o, regionTerms))
    .map((o) => ({ o, r: scoreShellfish(o, env) }))
    .filter(({ r }) => r.inSeason)
    .sort((a, b) => b.r.score - a.r.score)
    .slice(0, limit)
    .map(({ o, r }): RankedItem => ({
      id: o.id,
      kind: "shellfish",
      item: o,
      score: r.score,
      label: r.label,
      note: r.note,
      warn: r.warn,
      href: `/ocean/${o.id}`,
    }));
}

/** Whether any harvestable ocean species occurs in the region (ignoring season). */
export function oceanRegionCoverage(regionTerms: string[] | null): boolean {
  return HARVESTABLE_OCEAN.some((o) => speciesInRegions(o, regionTerms));
}
