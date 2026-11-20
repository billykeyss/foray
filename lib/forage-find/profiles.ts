/**
 * Habitat profiles for Forage Finder: what ground, weather and season each findable species wants.
 * Derived from the catalog record (fruitingMonths, peakMonths, elevationM, hostTrees, habitat,
 * substrate, conditions, microhabitat) plus a hand-tuned override table for the headline species.
 * Pure: callers pass the catalog in (components never import it).
 */
import type { Edibility, HostTree, MushroomSpecies } from "../species-types";
import type { Compass } from "./geo.ts";

export type BurnPref = "prefers" | "neutral";
export type Substrate = "soil" | "wood" | "open";

export interface HabitatProfile {
  id: string;
  name: string;
  scientific: string;
  edibility: Edibility;
  months: number[];
  peak: number[];
  elevationM: { min: number; max: number } | null;
  /** Lower-case keywords matched against LANDFIRE EVT name / group / cover type. */
  hosts: string[];
  substrate: Substrate;
  /** mm of rain over the past 7 days that typically triggers a flush. */
  minRain7dMm: number;
  moisture: "high" | "medium" | "low";
  /** [min, max] °C soil temperature (6 cm) window. */
  soilTempC: [number, number];
  /** -1 (ridges) … 0 (no preference) … 1 (drainage bottoms, creeksides). */
  drainage: number;
  /** Preferred slope facings, or null for any. */
  aspects: Compass[] | null;
  burn: BurnPref;
  cautions: string[];
  /** The species' range includes California / Nevada / the Sierra / Great Basin. */
  westRelevant: boolean;
}

/** Edibility classes offered as find targets; anything else needs an explicit headline override. */
const FINDABLE_EDIBILITY = new Set<Edibility>(["choice", "edible"]);
const NEVER = new Set<Edibility>(["toxic", "deadly", "psychoactive", "inedible", "medicinal-only"]);

const COOK = "Toxic raw: cook thoroughly.";

/** Hand-tuned overrides for the headline species (merged over the catalog-derived defaults). */
export const HEADLINE_OVERRIDES: Record<string, Partial<HabitatProfile>> = {
  "morchella-tomentosa": {
    burn: "prefers",
    soilTempC: [7, 14],
    elevationM: { min: 1200, max: 2800 },
    hosts: ["fir", "pine", "mixed conifer", "douglas-fir", "lodgepole", "jeffrey"],
    drainage: 0.2,
    moisture: "medium",
    westRelevant: true,
    cautions: [COOK, "False morels (Gyromitra) fruit at the same time: true morels are hollow top to bottom."],
  },
  "morchella-snyderi": {
    soilTempC: [7, 14],
    hosts: ["fir", "pine", "mixed conifer", "douglas-fir", "cottonwood", "aspen"],
    drainage: 0.4,
    westRelevant: true,
    cautions: [COOK, "False morels (Gyromitra) fruit at the same time: true morels are hollow top to bottom."],
  },
  "morchella-americana": {
    soilTempC: [8, 16],
    hosts: ["cottonwood", "riparian", "aspen", "ash", "willow"],
    drainage: 0.9,
    westRelevant: true,
    cautions: [COOK, "False morels (Gyromitra) fruit at the same time: true morels are hollow top to bottom."],
  },
  "cantharellus-formosus": { soilTempC: [5, 16], moisture: "high", drainage: 0.3 },
  "cantharellus-subalbidus": { soilTempC: [5, 16], moisture: "high", drainage: 0.3 },
  "cantharellus-californicus": {
    hosts: ["oak", "tanoak", "madrone"],
    elevationM: { min: 0, max: 1500 },
    soilTempC: [6, 16],
    moisture: "high",
    westRelevant: true,
  },
  "boletus-edulis": { soilTempC: [7, 18], drainage: 0.1 },
  "boletus-rex-veris": { soilTempC: [6, 15], westRelevant: true, aspects: ["N", "NE", "E", "NW"] },
  "boletus-barrowsii": { soilTempC: [8, 20] },
  "tricholoma-murrillianum": { soilTempC: [6, 15], drainage: -0.3, moisture: "medium", westRelevant: true },
  "hydnum-repandum": { soilTempC: [4, 14], moisture: "high", drainage: 0.3, westRelevant: true },
  "hypomyces-lactifluorum": { soilTempC: [6, 16], westRelevant: true },
  "pleurotus-populinus": {
    hosts: ["aspen", "cottonwood"],
    substrate: "wood",
    soilTempC: [8, 20],
    drainage: 0.4,
    westRelevant: true,
  },
  "pleurotus-ostreatus": { hosts: ["cottonwood", "alder", "riparian", "maple", "willow"], substrate: "wood", drainage: 0.8, soilTempC: [3, 15] },
  "coprinus-comatus": {
    substrate: "open",
    hosts: ["developed", "ruderal", "meadow", "grassland", "introduced", "pasture", "agricultur"],
    soilTempC: [6, 18],
    drainage: 0.2,
    westRelevant: true,
    cautions: ["Pick young and cook the same day: it deliquesces to ink within hours."],
  },
  "laetiporus-conifericola": {
    substrate: "wood",
    hosts: ["fir", "mixed conifer", "douglas-fir", "hemlock", "spruce"],
    soilTempC: [8, 22],
    westRelevant: true,
    cautions: ["Some people react: cook well and try a small amount first."],
  },
  "calvatia-booniana": {
    substrate: "open",
    hosts: ["sagebrush", "grassland", "meadow", "steppe", "shrubland"],
    soilTempC: [10, 24],
    moisture: "low",
    westRelevant: true,
    cautions: ["Slice top to bottom: pure white inside, no gills or cap outline (young Amanitas look like this)."],
  },
  "calbovista-subsculpta": {
    substrate: "open",
    hosts: ["red fir", "lodgepole", "subalpine", "jeffrey", "meadow", "whitebark"],
    soilTempC: [6, 18],
    moisture: "low",
    westRelevant: true,
    cautions: ["Slice top to bottom: pure white inside, no gills or cap outline (young Amanitas look like this)."],
  },
};

/** Shorthands people type → the headline catalog id. */
const ALIASES: Record<string, string> = {
  morel: "morchella-tomentosa",
  "burn morel": "morchella-tomentosa",
  "gray morel": "morchella-tomentosa",
  "black morel": "morchella-snyderi",
  "yellow morel": "morchella-americana",
  chanterelle: "cantharellus-formosus",
  "golden chanterelle": "cantharellus-formosus",
  porcini: "boletus-edulis",
  "king bolete": "boletus-edulis",
  king: "boletus-edulis",
  bolete: "boletus-edulis",
  "spring king": "boletus-rex-veris",
  matsutake: "tricholoma-murrillianum",
  hedgehog: "hydnum-repandum",
  lobster: "hypomyces-lactifluorum",
  oyster: "pleurotus-populinus",
  "aspen oyster": "pleurotus-populinus",
  "shaggy mane": "coprinus-comatus",
  "chicken of the woods": "laetiporus-conifericola",
  "chicken-of-the-woods": "laetiporus-conifericola",
  "sulfur shelf": "laetiporus-conifericola",
  puffball: "calvatia-booniana",
  "giant puffball": "calvatia-booniana",
};

const HOST_KEYWORDS: [RegExp, string[]][] = [
  [/^Abies concolor/, ["white fir", "mixed conifer"]],
  [/^Abies magnifica/, ["red fir"]],
  [/^Abies grandis/, ["grand fir", "mixed conifer"]],
  [/^Abies lasiocarpa/, ["subalpine fir", "subalpine"]],
  [/^Abies/, ["fir"]],
  [/^Pinus ponderosa/, ["ponderosa", "mixed conifer"]],
  [/^Pinus jeffreyi/, ["jeffrey"]],
  [/^Pinus contorta/, ["lodgepole"]],
  [/^Pinus lambertiana/, ["sugar pine", "mixed conifer"]],
  [/^Pinus monticola/, ["western white pine"]],
  [/^Pinus albicaulis/, ["whitebark"]],
  [/^Pinus (monophylla|edulis)/, ["pinyon"]],
  [/^Pinus/, ["pine"]],
  [/^Pseudotsuga/, ["douglas-fir", "mixed conifer"]],
  [/^Tsuga mertensiana/, ["mountain hemlock"]],
  [/^Tsuga/, ["hemlock"]],
  [/^Picea/, ["spruce"]],
  [/^Calocedrus/, ["incense", "mixed conifer"]],
  [/^Populus tremuloides/, ["aspen"]],
  [/^Populus/, ["cottonwood", "riparian"]],
  [/^Salix/, ["willow", "riparian"]],
  [/^Alnus/, ["alder", "riparian"]],
  [/^Quercus/, ["oak"]],
  [/^(Notholithocarpus|Lithocarpus)/, ["tanoak"]],
  [/^Arbutus/, ["madrone"]],
  [/^Sequoia/, ["sequoia", "redwood"]],
  [/^Juniperus/, ["juniper"]],
  [/^Acer/, ["maple", "riparian"]],
  [/^Larix/, ["larch"]],
  [/^Thuja/, ["cedar"]],
];

/** LANDFIRE-vocabulary keywords for a species' host trees (the first, most specific matching rule per tree). */
export function hostKeywords(hosts: HostTree[]): string[] {
  const out = new Set<string>();
  for (const h of hosts) {
    const rule = HOST_KEYWORDS.find(([re]) => re.test((h.scientific || "").trim()));
    rule?.[1].forEach((k) => out.add(k));
  }
  return [...out];
}

const WEST = /sierra|california|nevada|great basin|tahoe|eastern sierra|inter-?mountain/i;
const WOODY = /\b(wood|log|logs|stump|stumps|snag|snags|dead (trees|hardwood|conifer)|trunk|bark)\b/i;
const OPEN = /\b(grass|lawn|lawns|meadow|meadows|pasture|pastures|disturbed|roadside|roadsides|sagebrush|steppe|field|fields)\b/i;

function aspectsFrom(text: string | null | undefined): Compass[] | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/north/.test(t)) return ["N", "NE", "NW"];
  if (/south/.test(t)) return ["S", "SE", "SW"];
  if (/east/.test(t)) return ["E", "NE", "SE"];
  if (/west/.test(t)) return ["W", "NW", "SW"];
  return null;
}

/** A profile from the catalog record, with any headline override merged on top. */
export function buildProfile(s: MushroomSpecies): HabitatProfile {
  const micro = s.microhabitat;
  const moistText = `${micro?.moisturePreference ?? ""}`.toLowerCase();
  const terrainText = `${micro?.slopeAspect ?? ""} ${s.habitat}`.toLowerCase();
  const hosts = hostKeywords(s.hostTrees ?? []);
  const substrate: Substrate =
    s.trophicMode !== "mycorrhizal" && WOODY.test(s.substrate)
      ? "wood"
      : !hosts.length && OPEN.test(`${s.substrate} ${s.habitat}`)
        ? "open"
        : "soil";
  const [tMin, tMax] = s.conditions?.tempRangeC ?? [6, 18];
  const base: HabitatProfile = {
    id: s.id,
    name: s.commonNames[0] || s.scientific,
    scientific: s.scientific,
    edibility: s.edibility,
    months: s.fruitingMonths ?? [],
    peak: s.peakMonths ?? [],
    elevationM: s.elevationM ?? null,
    hosts,
    substrate,
    minRain7dMm: s.conditions?.minRain7d ?? 15,
    moisture: /wet|moist|boggy|saturated/.test(moistText) ? "high" : /well-drained|dry/.test(moistText) ? "low" : "medium",
    soilTempC: [Math.max(1, Math.round(tMin)), Math.round(tMax)],
    drainage: /riparian|streamside|creek|stream|drainage|ravine|seep|river/.test(terrainText)
      ? 0.6
      : /ridge|ridgetop|ridge-top/.test(terrainText)
        ? -0.4
        : 0.2,
    aspects: aspectsFrom(micro?.slopeAspect),
    burn: "neutral",
    cautions: s.edibility === "edible-when-cooked" ? [COOK] : [],
    westRelevant: (s.regionsPNW ?? []).some((r) => WEST.test(r)),
  };
  return { ...base, ...(HEADLINE_OVERRIDES[s.id] ?? {}) };
}

/** Offered as a find target: choice/edible curated species, or a headline override. Never dangerous. */
export function isFindable(s: MushroomSpecies): boolean {
  if (!s || NEVER.has(s.edibility) || /^Amanita\b/.test(s.scientific)) return false;
  if (!s.fruitingMonths?.length) return false;
  if (HEADLINE_OVERRIDES[s.id]) return true;
  return FINDABLE_EDIBILITY.has(s.edibility) && !s.autoCompiled;
}

export function findableProfiles(catalog: MushroomSpecies[]): HabitatProfile[] {
  return catalog.filter(isFindable).map(buildProfile);
}

export type SeasonStatus = "peak" | "in" | "out";
export function seasonStatus(p: Pick<HabitatProfile, "months" | "peak">, month: number): SeasonStatus {
  if (p.peak.includes(month) && p.months.includes(month)) return "peak";
  if (p.months.includes(month)) return "in";
  return "out";
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Apr–Aug", "Oct–Mar", "Oct–Feb, Jun–Aug", "Year-round". Runs wrap around the new year. */
export function monthsText(months: number[]): string {
  const set = new Set(months.filter((m) => m >= 1 && m <= 12));
  if (set.size === 12) return "Year-round";
  if (!set.size) return "—";
  const runs: [number, number][] = [];
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1;
    if (!set.has(m) || set.has(prev)) continue;
    let end = m;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== m) end = (end % 12) + 1;
    runs.push([m, end]);
  }
  // Longest-standing season first: the run containing the latest start that wraps the year leads.
  runs.sort((a, b) => (b[0] > b[1] ? 1 : 0) - (a[0] > a[1] ? 1 : 0) || a[0] - b[0]);
  return runs.map(([a, b]) => (a === b ? MON[a - 1] : `${MON[a - 1]}–${MON[b - 1]}`)).join(", ");
}

const EDIBLE_RANK: Partial<Record<Edibility, number>> = { choice: 0, edible: 1 };
/** Findable species fruiting in `month`: peak first, CA/NV-relevant first, choice before edible. */
export function inSeasonNow(profiles: HabitatProfile[], month: number, n = 6): { id: string; name: string; peak: boolean }[] {
  return profiles
    .filter((p) => p.months.includes(month))
    .sort(
      (a, b) =>
        Number(b.westRelevant) - Number(a.westRelevant) ||
        Number(b.peak.includes(month)) - Number(a.peak.includes(month)) ||
        (EDIBLE_RANK[a.edibility] ?? 2) - (EDIBLE_RANK[b.edibility] ?? 2) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, n)
    .map((p) => ({ id: p.id, name: p.name, peak: p.peak.includes(month) }));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\bmushrooms?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
const singular = (s: string) => s.replace(/(ies)$/, "y").replace(/(?<!s)s$/, "");

/** A free-text species ("morels", "porcini", "boletus-edulis", "Shaggy Mane") → its profile, or null. */
export function resolveFindTarget(query: string, profiles: HabitatProfile[]): HabitatProfile | null {
  const q = norm(query || "");
  if (!q) return null;
  const byId = new Map(profiles.map((p) => [p.id, p]));
  if (byId.has(q)) return byId.get(q)!;
  const one = singular(q);
  for (const k of [q, one]) if (ALIASES[k] && byId.has(ALIASES[k])) return byId.get(ALIASES[k])!;
  const exact = profiles.find((p) => [norm(p.name), norm(p.scientific)].some((n) => n === q || n === one));
  if (exact) return exact;
  const partial = profiles.find((p) => norm(p.name).includes(one) || norm(p.scientific).includes(one));
  return partial ?? null;
}
