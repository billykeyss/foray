/**
 * Presentation helpers shared by the ocean (coastal) list and detail pages.
 * No client hooks — safe to import from both server and client components.
 */
import type { OceanEdibility, OceanGroup, OceanSpecies } from "@/lib/ocean-types";
import type { OceanDetailImage } from "@/lib/ocean-image-types";

export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const OCEAN_KIND_LABEL: Record<string, string> = {
  whole: "Whole",
  blade: "Blade / frond",
  shell: "Shell",
  detail: "Detail",
  habitat: "In situ",
};

export const GROUP_LABEL: Record<OceanGroup, string> = {
  kelp: "Kelp",
  "red-algae": "Red algae",
  "green-algae": "Green algae",
  bivalve: "Bivalve",
  crustacean: "Crustacean",
  echinoderm: "Urchin",
  gastropod: "Snail",
  hazard: "Biotoxin hazard",
};

export const TIDE_LABEL: Record<string, string> = {
  high: "High intertidal",
  mid: "Mid intertidal",
  low: "Low intertidal",
  subtidal: "Subtidal",
};

export interface OceanEdibilityMeta {
  label: string;
  short: string;
  sub: string;
  color: string;
  bg: string;
}

const EDIBILITY: Record<OceanEdibility, OceanEdibilityMeta> = {
  choice: {
    label: "Choice",
    short: "Choice",
    sub: "Prized eating when correctly identified and legally harvested.",
    color: "var(--rust)",
    bg: "rgba(161, 74, 42, 0.1)",
  },
  edible: {
    label: "Edible",
    short: "Edible",
    sub: "Safe to eat when correctly identified and harvested from clean water.",
    color: "var(--moss-mid)",
    bg: "rgba(63, 82, 56, 0.1)",
  },
  "edible-cooked": {
    label: "Edible — cook first",
    short: "Cook first",
    sub: "Tough or unsafe raw. Cook or dry before eating.",
    color: "var(--rain-deep)",
    bg: "rgba(46, 68, 82, 0.1)",
  },
  "edible-with-caution": {
    label: "Edible — check advisory",
    short: "Caution",
    sub: "Biotoxin, quarantine, or water-quality risk. Check the state shellfish advisory before harvesting.",
    color: "#a8742c",
    bg: "rgba(168, 116, 44, 0.12)",
  },
  inedible: {
    label: "Inedible",
    short: "Inedible",
    sub: "Not eaten — unpalatable or without food value.",
    color: "#6b6b6b",
    bg: "rgba(107, 107, 107, 0.1)",
  },
  toxic: {
    label: "Hazard — do not eat",
    short: "Hazard",
    sub: "A biotoxin or pathogen. Catalogued as a warning, not a food.",
    color: "#c05420",
    bg: "rgba(192, 84, 32, 0.12)",
  },
  deadly: {
    label: "DEADLY — do not eat",
    short: "Deadly",
    sub: "Can be fatal. Catalogued as a biotoxin warning, not a food.",
    color: "#a02828",
    bg: "rgba(160, 40, 40, 0.13)",
  },
};

export function oceanEdibilityMeta(e: OceanEdibility): OceanEdibilityMeta {
  return EDIBILITY[e];
}

export function oceanEdibilityChip(e: OceanEdibility): { short: string; color: string } {
  const m = EDIBILITY[e];
  return { short: m.short, color: m.color };
}

/** Rough glyph for the card placeholder until a photo pipeline runs. */
export function OceanEmoji({ species }: { species: OceanSpecies }) {
  const g = species.group;
  const glyph =
    g === "hazard" ? "☣️"
    : g === "bivalve" ? "🦪"
    : g === "crustacean" ? "🦀"
    : g === "echinoderm" ? "🦔"
    : g === "gastropod" ? "🐌"
    : "🌿";
  return <span aria-hidden>{glyph}</span>;
}

export function pickHero(
  images: OceanDetailImage[] | undefined
): OceanDetailImage | undefined {
  if (!images || images.length === 0) return undefined;
  const order = ["whole", "shell", "blade", "habitat", "detail"];
  for (const k of order) {
    const hit = images.find((im) => im.kind === k);
    if (hit) return hit;
  }
  return images[0];
}
