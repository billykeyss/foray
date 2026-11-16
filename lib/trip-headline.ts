import type { ScopeStatus } from "./fishing/engine/types.ts";

/** One clause summarising nearby fishing status, or null when there's no fishing data. */
function fishClause(fish: ScopeStatus[]): string | null {
  if (fish.length === 0) return null;
  if (fish.includes("open")) return "Good to fish";
  if (fish.every((s) => s === "closed")) return "Nearby waters closed today";
  if (fish.includes("catch_and_release")) return "Catch & release nearby";
  return "Check fishing rules nearby";
}

/** The trip card headline, built from the forage reading's label and nearby waters' statuses.
 *  `place` is the current location's label when one is set: with no reading and no fishing data the
 *  headline stays neutral ("Today at <place>") rather than asking for a location that already exists. */
export function tripHeadline(forage: { label: string } | null, fish: ScopeStatus[], place?: string | null): string {
  const fishText = fishClause(fish);
  if (forage) {
    // Coupled to LABELS in lib/weather.ts: every band label is one word except
    // "Prime fruiting window", which reads as "Prime" here. Revisit if a label changes.
    const L = forage.label.trim().split(/\s+/)[0];
    if (!fishText) return `${L} for foraging`;
    if (fish.includes("open")) return `Good to fish, ${L.toLowerCase()} to forage`;
    return `${L} for foraging · ${fishText}`;
  }
  if (fishText) return fishText;
  return place != null ? `Today at ${place.trim() || "this spot"}` : "Set a location to plan today";
}

/** A nearby-water row as the trip card holds it (see components/trip-card/fish-half.tsx). */
export interface FishRowState {
  state: { kind: "loading" } | { kind: "ready"; status: ScopeStatus } | { kind: "not-cached" } | { kind: "error" };
}

/** Statuses the headline may use. null while any row is still loading (hold the fish clause back);
 *  a row that couldn't load (not downloaded / error) counts as "unknown", so the headline can never
 *  claim e.g. "closed" for a water whose rules we don't have. */
export function settledFishStatuses(rows: FishRowState[] | null): ScopeStatus[] | null {
  if (!rows) return [];
  if (rows.some((r) => r.state.kind === "loading")) return null;
  return rows.map((r) => (r.state.kind === "ready" ? r.state.status : "unknown"));
}
