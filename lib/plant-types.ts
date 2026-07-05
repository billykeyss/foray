/**
 * Wild edible plant ("green edible") catalog — type definitions.
 *
 * Parallel to `MushroomSpecies` (lib/species-types.ts) but plant-appropriate:
 * seasonal rather than rain-flush, keyed on edible parts and preparation, with
 * first-class toxic-lookalike handling. Shares the common `Forageable` fields
 * (id, names, region, sources, verification) so cross-cutting utilities and UI
 * work across catalogs. See docs/superpowers/prompts/forecasting-score-scaling.md
 * for the seasonality scorer that consumes `harvestMonths` / `seasonCue`.
 */
import type { Forageable } from "./forageable";
import type { Danger } from "./species-types";

export type PlantHabit =
  | "herb"
  | "shrub"
  | "vine"
  | "fern"
  | "grass"
  | "aquatic"
  | "tree";

export type LifeCycle = "annual" | "biennial" | "perennial";

export type PlantEdibility =
  | "choice"
  | "edible"
  /** toxic or unpalatable raw, safe once properly cooked/dried (nettle, elderberry) */
  | "edible-cooked"
  /** edible but with a real caveat: oxalates, water-quality, allergen, quantity limits */
  | "edible-with-caution"
  | "medicinal"
  | "inedible"
  | "toxic"
  | "deadly";

export type EdiblePart =
  | "young-leaves"
  | "leaves"
  | "shoots"
  | "stems"
  | "flowers"
  | "buds"
  | "root"
  | "tuber"
  | "bulb"
  | "seeds"
  | "nut"
  | "berry"
  | "fruit"
  | "hips"
  | "pollen"
  | "sap"
  | "inner-bark";

/** When the edible part is prime, and how weather shifts that window. */
export interface SeasonCue {
  /** does an early/late spring meaningfully move the harvest window? */
  tempSensitive: boolean;
  /** plain-language phenology note (bud-break cues, snowmelt timing, etc.) */
  notes: string | null;
}

/** Plant-appropriate field-ID details — mirrors mushroom `Identification`. */
export interface PlantIdentification {
  leaves: string;
  stem: string;
  flowers: string;
  fruit: string | null;
  root: string | null;
  /** crushed-leaf / root aroma — often the safety test (e.g. onion smell) */
  aroma: string | null;
  height: string | null;
  /** 2–4 at-a-glance diagnostic cues, rendered as chips */
  keyFeatures: string[];
}

export interface PlantLookalike {
  name: string;
  scientific: string;
  danger: Danger;
  distinguishingFeature: string;
  /** points at the catalogued plant/warning entry this lookalike *is*, when present */
  catalogId?: string;
  keyFeatures?: string[];
}

export interface PlantCulinary {
  flavor: string;
  uses: string;
  preservation: string | null;
}

export interface PlantSpecies extends Forageable {
  habit: PlantHabit;
  lifeCycle: LifeCycle;
  heightCm: { min: number; max: number } | null;

  /** months 1-12 the edible part is prime to harvest (Sierra montane timing) */
  harvestMonths: number[];
  /** months 1-12 of peak quality/abundance */
  peakMonths: number[];
  seasonCue: SeasonCue;

  edibleParts: EdiblePart[];
  edibility: PlantEdibility;
  /** how to make it safe/palatable — the must-cook / leaching / drying step */
  preparation: string;
  /** the one caveat a forager must not miss (oxalates, giardia, quantity), or null */
  cautions: string | null;
  toxicityNotes: string | null;

  identification: PlantIdentification;
  lookalikes: PlantLookalike[];

  culinary: PlantCulinary;
  conservationNotes: string | null;
}
