/**
 * Aggregated coastal / intertidal foraging catalog (California + Pacific NW
 * coast). Hand-verified seed species live in lib/catalog/ocean/curated.ts;
 * pipeline-added species in lib/catalog/ocean/generated.ts. Mirrors
 * lib/plant-catalog.ts and lib/species-catalog.ts.
 */
import type { OceanSpecies } from "./ocean-types";
import { CURATED_OCEAN } from "./catalog/ocean/curated.ts";
import { GENERATED_OCEAN } from "./catalog/ocean/generated.ts";

export const OCEAN_CATALOG: OceanSpecies[] = [
  ...CURATED_OCEAN,
  ...GENERATED_OCEAN,
];

/** Species a forager would actually harvest — excludes the biotoxin hazard
 *  warning entries that exist only so shellfish can link to them. */
export const HARVESTABLE_OCEAN: OceanSpecies[] = OCEAN_CATALOG.filter(
  (o) => o.group !== "hazard"
);

export type { OceanSpecies } from "./ocean-types";
