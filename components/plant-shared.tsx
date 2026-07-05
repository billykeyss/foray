/**
 * Small presentation helpers shared by the plant list and detail pages.
 * No client hooks — safe to import from both server and client components.
 */
import type { PlantEdibility, PlantSpecies } from "@/lib/plant-types";
import type { PlantDetailImage } from "@/lib/plant-image-types";

export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Human labels for the plant photo-gallery feature tags. */
export const PLANT_KIND_LABEL: Record<string, string> = {
  whole: "Whole plant",
  leaf: "Leaves",
  flower: "Flowers",
  fruit: "Fruit",
  seed: "Seed",
  bark: "Stem & bark",
  root: "Root",
  habitat: "In situ",
};

/** Pick the most representative photo for a hero / card thumbnail. */
export function pickHero(
  images: PlantDetailImage[] | undefined
): PlantDetailImage | undefined {
  if (!images || images.length === 0) return undefined;
  const order = ["whole", "flower", "leaf", "fruit", "habitat", "seed", "bark", "root"];
  for (const k of order) {
    const hit = images.find((im) => im.kind === k);
    if (hit) return hit;
  }
  return images[0];
}

export interface EdibilityMeta {
  label: string;
  short: string;
  sub: string;
  color: string;
  bg: string;
}

const EDIBILITY: Record<PlantEdibility, EdibilityMeta> = {
  choice: {
    label: "Choice edible",
    short: "Choice",
    sub: "Prized eating when correctly identified.",
    color: "var(--rust)",
    bg: "rgba(161, 74, 42, 0.1)",
  },
  edible: {
    label: "Edible",
    short: "Edible",
    sub: "Safe to eat when correctly identified.",
    color: "var(--moss-mid)",
    bg: "rgba(63, 82, 56, 0.1)",
  },
  "edible-cooked": {
    label: "Edible — cook first",
    short: "Cook first",
    sub: "Toxic or unpalatable raw. Must be properly cooked or dried.",
    color: "var(--rain-deep)",
    bg: "rgba(46, 68, 82, 0.1)",
  },
  "edible-with-caution": {
    label: "Edible with caution",
    short: "Caution",
    sub: "Edible but with a real caveat — read the cautions before eating.",
    color: "#a8742c",
    bg: "rgba(168, 116, 44, 0.12)",
  },
  medicinal: {
    label: "Medicinal only",
    short: "Medicinal",
    sub: "Used as tea, tincture, or extract rather than eaten as food.",
    color: "var(--moss-mid)",
    bg: "rgba(63, 82, 56, 0.1)",
  },
  inedible: {
    label: "Inedible",
    short: "Inedible",
    sub: "Not poisonous, but not eaten — unpalatable or without food value.",
    color: "#6b6b6b",
    bg: "rgba(107, 107, 107, 0.1)",
  },
  toxic: {
    label: "Toxic — do not eat",
    short: "Toxic",
    sub: "Causes serious illness. Catalogued as a lookalike warning, not a food.",
    color: "#c05420",
    bg: "rgba(192, 84, 32, 0.12)",
  },
  deadly: {
    label: "DEADLY — do not eat",
    short: "Deadly",
    sub: "Contains lethal toxins. Catalogued as a lookalike warning, not a food.",
    color: "#a02828",
    bg: "rgba(160, 40, 40, 0.13)",
  },
};

export function edibilityMeta(e: PlantEdibility): EdibilityMeta {
  return EDIBILITY[e];
}

export function edibilityChip(e: PlantEdibility): { short: string; color: string } {
  const m = EDIBILITY[e];
  return { short: m.short, color: m.color };
}

/** A rough glyph for the card placeholder until a photo pipeline runs. */
export function PlantEmoji({ plant }: { plant: PlantSpecies }) {
  const parts = plant.edibleParts;
  let glyph = "🌿";
  if (plant.edibility === "deadly" || plant.edibility === "toxic") glyph = "☠️";
  else if (plant.edibility === "inedible") glyph = "🚫";
  else if (parts.includes("bulb")) glyph = "🧅";
  else if (parts.includes("nut")) glyph = "🌰";
  else if (parts.includes("berry") || parts.includes("hips") || parts.includes("fruit")) glyph = "🍓";
  else if (parts.includes("pollen")) glyph = "🌾";
  else if (plant.habit === "aquatic") glyph = "🌾";
  else if (parts.includes("flowers") && parts.length === 1) glyph = "🌸";
  return <span aria-hidden>{glyph}</span>;
}
