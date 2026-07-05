/**
 * Shared contract across every forageable catalog (mushrooms, trees, plants).
 *
 * This is a *structural* view, not a base class to inherit from. Cross-cutting
 * code — region filtering (`speciesInRegions`), the image/gallery pipeline,
 * verification badges, offline-region bundling — should accept `Forageable`
 * instead of `MushroomSpecies`, so all three catalogs reuse it without a nominal
 * hierarchy. `MushroomSpecies` already satisfies this shape; `PlantSpecies`
 * extends it explicitly; trees can be adopted opportunistically later.
 */
import type { Source, Verification } from "./species-types";

export interface Forageable {
  id: string;
  commonNames: string[];
  scientific: string;
  family: string;
  habitat: string;
  elevationM: { min: number; max: number } | null;
  /** region terms matched (case-insensitively) by `lib/regions.ts` REGIONS */
  regionsPNW: string[];
  sources: Source[];
  /** cross-source verification status (optional so old entries stay valid) */
  verification?: Verification;
  /** true for entries produced by a research pipeline vs. hand-curation */
  autoCompiled?: boolean;
}
