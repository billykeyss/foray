import { FISH_WATERS } from "./waters-index.ts";
import type { WaterSummary } from "./types.ts";

const TYPE_RANK: Record<string, number> = { lake: 0, reservoir: 0, river: 1 };

/**
 * Search waters by name, then by fish species. Case-insensitive. Name ranking:
 * names starting with the query, then word-prefix matches, then substring; ties by water type (lakes and reservoirs first, so "donner" lists the lake before the creek), then name.
 * Species matches (e.g. "golden trout") follow all name matches.
 */
export function searchWaters(q: string, limit = 8, waters: WaterSummary[] = FISH_WATERS): WaterSummary[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const tiers: Array<Array<{ w: WaterSummary; key: string }>> = [[], [], [], []];
  for (const w of waters) {
    const name = w.name.toLowerCase();
    let tier = -1;
    if (name.startsWith(needle)) tier = 0;
    else if (name.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle)) || name.includes(` ${needle}`)) tier = 1;
    else if (name.includes(needle)) tier = 2;
    else if (w.species.some((s) => s.toLowerCase().includes(needle))) tier = 3;
    if (tier >= 0) tiers[tier].push({ w, key: name });
  }
  return tiers
    .flatMap((t) => t.sort((a, b) => (TYPE_RANK[a.w.waterType] ?? 2) - (TYPE_RANK[b.w.waterType] ?? 2) || a.key.localeCompare(b.key)).map((x) => x.w))
    .slice(0, limit);
}
