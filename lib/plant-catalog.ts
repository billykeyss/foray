/**
 * Aggregated wild edible plant ("green edible") catalog. The hand-verified seed
 * species live in `lib/catalog/plants/curated.ts`; pipeline-added species live in
 * `lib/catalog/plants/generated.ts`. Consumers import `PLANT_CATALOG` from here
 * and need not care about the split. Mirrors `lib/species-catalog.ts`.
 */
import type { PlantSpecies } from "./plant-types";
import { CURATED_PLANTS } from "./catalog/plants/curated.ts";
import { GENERATED_PLANTS } from "./catalog/plants/generated.ts";

export const PLANT_CATALOG: PlantSpecies[] = [
  ...CURATED_PLANTS,
  ...GENERATED_PLANTS,
];

/** Plants a forager would actually harvest — excludes the deadly/toxic
 *  warning entries that exist only so lookalikes can deep-link to them. */
export const EDIBLE_PLANTS: PlantSpecies[] = PLANT_CATALOG.filter(
  (p) => p.edibility !== "deadly" && p.edibility !== "toxic" && p.edibility !== "inedible"
);

export type { PlantSpecies } from "./plant-types";
