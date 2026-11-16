import type { ScopeStatus } from "./fishing/engine/types.ts";

/** One clause summarising nearby fishing status, or null when there's no fishing data. */
function fishClause(fish: ScopeStatus[]): string | null {
  if (fish.length === 0) return null;
  if (fish.includes("open")) return "Good to fish";
  if (fish.every((s) => s === "closed")) return "Nearby waters closed today";
  if (fish.includes("catch_and_release")) return "Catch & release nearby";
  return "Check fishing rules nearby";
}

/** The trip card headline, built from the forage reading's label and nearby waters' statuses. */
export function tripHeadline(forage: { label: string } | null, fish: ScopeStatus[]): string {
  const fishText = fishClause(fish);
  if (forage) {
    // SporeReading labels are mostly one word; "Prime fruiting window" reads as "Prime" here.
    const L = forage.label.trim().split(/\s+/)[0];
    if (!fishText) return `${L} for foraging`;
    if (fish.includes("open")) return `Good to fish, ${L.toLowerCase()} to forage`;
    return `${L} for foraging · ${fishText}`;
  }
  return fishText ?? "Set a location to plan today";
}
