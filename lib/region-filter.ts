import type { Forageable } from "./forageable";

/** Case-insensitive match: any of the entry's regions contains any filter term.
 *  Typed against `Forageable` so mushrooms, trees, plants and ocean all reuse it.
 *
 *  Lives in its own dependency-free module (only a type import) so node scripts
 *  and tests can use it without pulling in the whole weather/catalog graph.
 *  `lib/weather.ts` re-exports it for backward compatibility. */
export function speciesInRegions(
  s: Pick<Forageable, "regionsPNW">,
  filterTerms?: string[] | null
): boolean {
  if (!filterTerms || filterTerms.length === 0) return true;
  const hay = s.regionsPNW.map((r) => r.toLowerCase());
  return filterTerms.some((term) => {
    const t = term.toLowerCase();
    return hay.some((h) => h.includes(t));
  });
}
