/**
 * Resolve a catalog id to its detail route + display label. Lives in lib (not
 * components) per components/CLAUDE.md: components don't import catalog
 * modules directly. Built once as a Map — one source of truth for chips and
 * cards.
 */
import { PNW_CATALOG } from "../species-catalog.ts";
import { PLANT_CATALOG } from "../plant-catalog.ts";
import { OCEAN_CATALOG } from "../ocean-catalog.ts";

export interface SpeciesRoute {
  href: string;
  label: string;
}

const ROUTES = new Map<string, SpeciesRoute>();
for (const s of PNW_CATALOG) {
  ROUTES.set(s.id, { href: `/catalog/${s.id}`, label: s.commonNames[0] ?? s.scientific });
}
for (const s of PLANT_CATALOG) {
  if (!ROUTES.has(s.id)) {
    ROUTES.set(s.id, { href: `/plants/${s.id}`, label: s.commonNames[0] ?? s.scientific });
  }
}
for (const s of OCEAN_CATALOG) {
  if (!ROUTES.has(s.id)) {
    ROUTES.set(s.id, { href: `/ocean/${s.id}`, label: s.commonNames[0] ?? s.scientific });
  }
}

export function speciesRoute(id: string): SpeciesRoute | null {
  return ROUTES.get(id) ?? null;
}
