/**
 * Chat agent tools: Anthropic tool schemas (plain objects — this module is
 * SDK-free so node tests can import it) and their executors over the bundled
 * catalogs. Weather/spots/journal executors + the dispatcher are further down.
 */
import dayjs from "dayjs";
import { PNW_CATALOG } from "../species-catalog.ts";
import { PLANT_CATALOG } from "../plant-catalog.ts";
import { OCEAN_CATALOG } from "../ocean-catalog.ts";
import { REGIONS, type RegionId } from "../regions.ts";
import { speciesInRegions } from "../region-filter.ts";
import { SPECIES_IMAGES } from "../species-images.ts";
import { localImage } from "../image-src.ts";
import type { MushroomSpecies } from "../species-types";
import type { PlantSpecies } from "../plant-types";
import type { OceanSpecies } from "../ocean-types";
import { fetchWeather, computeSporeScore } from "../weather.ts";
import { selectCandidates, scoreCandidates } from "../spot-finder.ts";
import type { JournalEntry } from "../journal.ts";

export type CatalogKind = "mushroom" | "plant" | "ocean";

export const TOOL_RESULT_CAP = 8000;

export const TOOL_SCHEMAS = [
  {
    name: "search_catalog",
    description:
      "Search Foray's foraging catalogs (mushrooms, wild plants, coastal/ocean). Call this FIRST for any species question. Returns compact records with ids for get_species.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name fragment, common or scientific" },
        kind: { type: "string", enum: ["mushroom", "plant", "ocean"], description: "Restrict to one catalog" },
        edibility: {
          type: "string",
          enum: [
            "edible",
            "choice",
            "edible-with-caution",
            "edible-when-cooked",
            "edible-cooked",
            "inedible",
            "psychoactive",
            "medicinal",
            "medicinal-only",
            "toxic",
            "deadly",
          ],
          description:
            "Filter: 'edible' matches the whole edible family (choice/edible/edible-*); cooked/medicinal variants match across catalog vocabularies",
        },
        month: { type: "number", description: "1-12; only species fruiting/harvestable that month" },
        hostTree: {
          type: "string",
          description:
            "Host/partner tree filter (mushrooms only), common or scientific name substring, e.g. 'pine' or 'Pinus'",
        },
        region: {
          type: "string",
          enum: ["sierra-nevada", "pacific-northwest", "california-coast", "great-basin", "all"],
          description: "Filter by app region",
        },
        limit: { type: "number", description: "Max results, default 8, cap 10" },
      },
      required: [],
    },
  },
  {
    name: "get_species",
    description:
      "Full catalog record for one species id (from search_catalog): identification, edibility, safety notes, dangerous lookalikes, season, habitat, sources.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description:
            "Exact catalog id from a prior search_catalog result (e.g. 'boletus-edulis') — not a common name.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "get_weather",
    description:
      "7-day weather outlook + Foray's Spore Score (0-100 fruiting-conditions composite) for coordinates. Defaults to the user's saved location.",
    input_schema: {
      type: "object" as const,
      properties: {
        lat: { type: "number" },
        lon: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "find_spots",
    description:
      "Score nearby known foraging spots by current weather (Spore Score). Use for 'where should I go' questions. Requires the user's location.",
    input_schema: {
      type: "object" as const,
      properties: {
        maxKm: { type: "number", description: "Search radius in km, default 250" },
        max: { type: "number", description: "Max spots, default 6, cap 10" },
      },
      required: [],
    },
  },
  {
    name: "read_journal",
    description:
      "The user's own foraging journal entries (species, location, date, notes, conditions), newest first. Use for questions about the user's past finds.",
    input_schema: {
      type: "object" as const,
      properties: { limit: { type: "number", description: "Default 10, cap 25" } },
      required: [],
    },
  },
];

/** Server-side tool — runs on Anthropic's infra, no client executor. */
export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 3,
};

export interface CatalogHit {
  id: string;
  kind: CatalogKind;
  common: string;
  scientific: string;
  edibility: string;
  months: number[];
  thumb: string | null;
}

const EDIBILITY_ALIASES: Record<string, string[]> = {
  "edible-when-cooked": ["edible-when-cooked", "edible-cooked"],
  "edible-cooked": ["edible-when-cooked", "edible-cooked"],
  medicinal: ["medicinal", "medicinal-only"],
  "medicinal-only": ["medicinal", "medicinal-only"],
};

function edibilityMatches(value: string, filter: string): boolean {
  if (filter === "edible") return value === "choice" || value.startsWith("edible");
  return (EDIBILITY_ALIASES[filter] ?? [filter]).includes(value);
}

function regionTerms(region?: string): string[] | null | undefined {
  if (!region) return undefined;
  return REGIONS.find((r) => r.id === (region as RegionId))?.terms ?? undefined;
}

export function searchCatalog(input: {
  query?: string;
  kind?: CatalogKind;
  edibility?: string;
  month?: number;
  region?: string;
  hostTree?: string;
  limit?: number;
}): CatalogHit[] {
  const limit = Math.min(input.limit ?? 8, 10);
  const q = input.query?.toLowerCase().trim();
  const ht = input.hostTree?.toLowerCase().trim();
  const terms = regionTerms(input.region);

  const pools: { kind: CatalogKind; items: (MushroomSpecies | PlantSpecies | OceanSpecies)[] }[] = [
    { kind: "mushroom", items: PNW_CATALOG },
    { kind: "plant", items: PLANT_CATALOG },
    { kind: "ocean", items: OCEAN_CATALOG },
  ];

  function collectPoolHits(
    pool: { kind: CatalogKind; items: (MushroomSpecies | PlantSpecies | OceanSpecies)[] },
    cap: number
  ): CatalogHit[] {
    const hits: CatalogHit[] = [];
    for (const s of pool.items) {
      const months =
        "fruitingMonths" in s ? s.fruitingMonths : (s as PlantSpecies | OceanSpecies).harvestMonths;
      if (q) {
        const hay = [...s.commonNames, s.scientific].join(" ").toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (input.edibility && !edibilityMatches(String(s.edibility), input.edibility)) continue;
      if (input.month && !months.includes(input.month)) continue;
      if (terms !== undefined && !speciesInRegions(s, terms)) continue;
      if (ht) {
        // Host trees are a mushroom concept; a hostTree query intentionally
        // excludes plant/ocean species.
        const trees = "hostTrees" in s ? s.hostTrees : [];
        if (
          !trees.some(
            (t) =>
              t.common.toLowerCase().includes(ht) ||
              t.scientific.toLowerCase().includes(ht)
          )
        ) {
          continue;
        }
      }
      hits.push({
        id: s.id,
        kind: pool.kind,
        common: s.commonNames[0],
        scientific: s.scientific,
        edibility: String(s.edibility),
        months,
        thumb:
          pool.kind === "mushroom" && SPECIES_IMAGES[s.id]?.thumb
            ? localImage(SPECIES_IMAGES[s.id].thumb)
            : null,
      });
      if (hits.length >= cap) break;
    }
    return hits;
  }

  const selected = pools.filter((p) => !input.kind || p.kind === input.kind);
  const perPool = selected.map((pool) => collectPoolHits(pool, limit));
  // Round-robin merge so the large mushroom catalog doesn't crowd out
  // plants/ocean on cross-catalog queries.
  const merged: CatalogHit[] = [];
  for (let i = 0; merged.length < limit; i++) {
    let took = false;
    for (const hits of perPool) {
      if (i < hits.length && merged.length < limit) {
        merged.push(hits[i]);
        took = true;
      }
    }
    if (!took) break;
  }
  return merged;
}

export type SpeciesDetail = Record<string, unknown> & {
  id: string;
  kind: CatalogKind;
  edibility: string;
  lookalikes: unknown[];
};

export function getSpeciesDetail(id: string): SpeciesDetail {
  const m = PNW_CATALOG.find((s) => s.id === id);
  if (m) {
    return {
      kind: "mushroom",
      id: m.id,
      common: m.commonNames,
      scientific: m.scientific,
      family: m.family,
      edibility: m.edibility,
      toxicityNotes: m.toxicityNotes,
      identification: m.identification,
      conditions: m.conditions,
      habitat: m.habitat,
      elevationM: m.elevationM,
      regionsPNW: m.regionsPNW,
      fruitingMonths: m.fruitingMonths,
      peakMonths: m.peakMonths,
      hostTrees: m.hostTrees.slice(0, 6),
      lookalikes: m.lookalikes.map((l) => ({
        name: l.name,
        scientific: l.scientific,
        danger: l.danger,
        distinguishingFeature: l.distinguishingFeature,
        catalogId: l.catalogId ?? null,
      })),
      culinary: m.culinary,
      autoCompiled: m.autoCompiled ?? false,
      sources: m.sources.map((s) => ({ name: s.name, url: s.url })),
    };
  }
  const p = PLANT_CATALOG.find((s) => s.id === id);
  if (p) {
    return {
      kind: "plant",
      id: p.id,
      common: p.commonNames,
      scientific: p.scientific,
      family: p.family,
      edibility: p.edibility,
      edibleParts: p.edibleParts,
      preparation: p.preparation,
      cautions: p.cautions,
      toxicityNotes: p.toxicityNotes,
      identification: p.identification,
      habitat: p.habitat,
      regionsPNW: p.regionsPNW,
      harvestMonths: p.harvestMonths,
      peakMonths: p.peakMonths,
      lookalikes: p.lookalikes.map((l) => ({
        name: l.name,
        scientific: l.scientific,
        danger: l.danger,
        distinguishingFeature: l.distinguishingFeature,
        catalogId: l.catalogId ?? null,
      })),
      culinary: p.culinary,
      sources: p.sources.map((s) => ({ name: s.name, url: s.url })),
    };
  }
  const o = OCEAN_CATALOG.find((s) => s.id === id);
  if (o) {
    return {
      kind: "ocean",
      id: o.id,
      common: o.commonNames,
      scientific: o.scientific,
      group: o.group,
      edibility: o.edibility,
      edibleParts: o.edibleParts,
      preparation: o.preparation,
      cautions: o.cautions,
      biotoxinNotes: o.biotoxinNotes,
      regulations: o.regulations,
      identification: o.identification,
      habitat: o.habitat,
      tidalZone: o.tidalZone,
      bestTide: o.bestTide,
      regionsPNW: o.regionsPNW,
      harvestMonths: o.harvestMonths,
      peakMonths: o.peakMonths,
      lookalikes: o.lookalikes.map((l) => ({
        name: l.name,
        scientific: l.scientific,
        danger: l.danger,
        distinguishingFeature: l.distinguishingFeature,
        catalogId: l.catalogId ?? null,
      })),
      culinary: o.culinary,
      sources: o.sources.map((s) => ({ name: s.name, url: s.url })),
    };
  }
  throw new Error(`No species with id "${id}" in any catalog. Use search_catalog first.`);
}

export interface ToolContext {
  lat: number | null;
  lon: number | null;
  locationLabel: string;
  regionId: RegionId;
}

export interface ToolCard {
  tool: string;
  data: unknown;
}

export function capJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json.length <= TOOL_RESULT_CAP) return json;
  return json.slice(0, TOOL_RESULT_CAP) + "…[truncated]";
}

async function getWeatherTool(
  input: { lat?: number; lon?: number },
  ctx: ToolContext
) {
  const lat = input.lat ?? ctx.lat;
  const lon = input.lon ?? ctx.lon;
  if (lat == null || lon == null) {
    throw new Error("No coordinates: pass lat/lon or have the user set a location.");
  }
  const days = await fetchWeather(lat, lon);
  const reading = computeSporeScore(days);
  // Local date, not UTC: computeSporeScore/fetchWeather anchor on dayjs()'s
  // local calendar date, and a UTC anchor would start evening US users'
  // outlook on tomorrow (or, via a findIndex fallback of 0, on past days).
  const todayISO = dayjs().format("YYYY-MM-DD");
  let idx = days.findIndex((d) => d.time === todayISO);
  if (idx < 0) idx = days.findIndex((d) => d.time > todayISO);
  if (idx < 0) idx = 0;
  return {
    label: input.lat != null ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : ctx.locationLabel,
    reading,
    outlook: days.slice(idx, idx + 7).map((d) => ({
      date: d.time,
      tempMaxC: d.tempMax,
      tempMinC: d.tempMin,
      rainMm: d.precipitation,
      humidityPct: d.humidity,
    })),
  };
}

async function findSpotsTool(
  input: { maxKm?: number; max?: number },
  ctx: ToolContext
) {
  if (ctx.lat == null || ctx.lon == null) {
    throw new Error("The user has no location set — ask them to pick one on the map first.");
  }
  const candidates = selectCandidates(
    ctx.lat,
    ctx.lon,
    ctx.locationLabel || "here",
    input.maxKm ?? 250,
    Math.min(input.max ?? 6, 10)
  );
  const scored = await scoreCandidates(candidates);
  return scored
    .filter((c) => c.reading)
    .map((c) => ({
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      distanceKm: Number(c.distanceKm.toFixed(1)),
      sporeScore: c.reading!.score,
      rain7dMm: Number(c.reading!.rain7d.toFixed(0)),
      daysSinceRain: c.reading!.daysSinceRain,
    }));
}

function readJournalTool(input: { limit?: number }): unknown[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem("mycelium.journal.v1");
    if (!raw) return [];
    const entries: JournalEntry[] = JSON.parse(raw);
    let out = entries.slice(0, Math.min(input.limit ?? 10, 25)).map((e) => ({
      date: e.date,
      species: e.species,
      location: e.location,
      notes: e.notes.length > 500 ? e.notes.slice(0, 500) + "…" : e.notes,
      lat: e.lat ?? null,
      lon: e.lon ?? null,
      conditions: e.weather ?? null,
      // photoDataUrl deliberately excluded: huge base64 blobs
    }));
    // Aggregate cap: 25 entries with long notes can exceed TOOL_RESULT_CAP
    // and hit capJson's raw slicer (invalid JSON). Drop trailing (oldest)
    // entries until the serialized array fits.
    while (out.length > 1 && JSON.stringify(out).length > TOOL_RESULT_CAP) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Execute one client tool. Returns a JSON string (≤ TOOL_RESULT_CAP chars) and
 * emits a UI card. Throws on failure — the agent loop converts throws into
 * is_error tool_results.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  onCard: (card: ToolCard) => void
): Promise<string> {
  switch (name) {
    case "search_catalog": {
      const hits = searchCatalog(input as Parameters<typeof searchCatalog>[0]);
      onCard({ tool: "search_catalog", data: hits });
      return capJson(hits);
    }
    case "get_species": {
      const detail = getSpeciesDetail(String(input.id));
      onCard({
        tool: "get_species",
        data: {
          id: detail.id,
          kind: detail.kind,
          common: Array.isArray(detail.common) ? detail.common[0] : detail.common,
          scientific: detail.scientific,
          edibility: detail.edibility,
          thumb:
            detail.kind === "mushroom" && SPECIES_IMAGES[detail.id]?.thumb
              ? localImage(SPECIES_IMAGES[detail.id].thumb)
              : null,
          lookalikes: detail.lookalikes,
        },
      });
      // Never raw-slice a species record: ~35 mushroom entries exceed the cap,
      // and a blind slice can land mid-lookalikes — dropping safety-critical
      // content. Shed low-priority fields first; lookalikes/edibility/
      // toxicityNotes/cautions/biotoxinNotes are never shed. identification
      // goes last and only in the extreme case — corrupt JSON would be worse.
      let out = JSON.stringify(detail);
      if (out.length > TOOL_RESULT_CAP) {
        const trimmed: Record<string, unknown> = { ...detail };
        for (const field of [
          "sources",
          "culinary",
          "hostTrees",
          "conditions",
          "habitat",
          "regionsPNW",
          "identification",
        ]) {
          if (out.length <= TOOL_RESULT_CAP) break;
          delete trimmed[field];
          out = JSON.stringify(trimmed);
        }
      }
      return out.length <= TOOL_RESULT_CAP ? out : capJson(detail);
    }
    case "get_weather": {
      const w = await getWeatherTool(input as { lat?: number; lon?: number }, ctx);
      onCard({ tool: "get_weather", data: w });
      return capJson(w);
    }
    case "find_spots": {
      const spots = await findSpotsTool(input as { maxKm?: number; max?: number }, ctx);
      onCard({ tool: "find_spots", data: spots });
      return capJson(spots);
    }
    case "read_journal": {
      const entries = readJournalTool(input as { limit?: number });
      onCard({ tool: "read_journal", data: { count: entries.length } });
      return capJson(entries);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
