"use client";

import dayjs from "dayjs";
import {
  computeSporeScore,
  fetchWeather,
  type DailyWeather,
  type SporeReading,
} from "./weather.ts";
import { PNW_CATALOG } from "./species-catalog.ts";
import { speciesInRegions } from "./weather.ts";

export interface CandidateSpot {
  name: string;
  lat: number;
  lon: number;
  group?: string;
  distanceKm: number;
  reading: SporeReading | null;
  weather: DailyWeather[];
  error?: string;
}

export interface RankedSpot {
  rank: number;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  score: number;
  reasoning: string;
  likelySpecies: { commonName: string; scientific: string }[];
  cautions?: string;
}

// Reno-anchored preset spots — copied from LocationChooser so the spot
// finder doesn't depend on UI imports.
const PRESETS: { name: string; lat: number; lon: number; group: string }[] = [
  { name: "Tahoe Meadows", lat: 39.312, lon: -119.896, group: "Near Reno" },
  { name: "Galena Creek", lat: 39.362, lon: -119.837, group: "Near Reno" },
  { name: "Spooner Summit", lat: 39.106, lon: -119.912, group: "Near Reno" },
  { name: "Mt. Rose Wilderness", lat: 39.343, lon: -119.916, group: "Near Reno" },
  { name: "Truckee", lat: 39.328, lon: -120.183, group: "Tahoe Basin" },
  { name: "Donner Summit", lat: 39.315, lon: -120.336, group: "Tahoe Basin" },
  { name: "Tahoe West Shore", lat: 39.097, lon: -120.123, group: "Tahoe Basin" },
  { name: "Echo Summit", lat: 38.812, lon: -120.034, group: "Tahoe Basin" },
  { name: "Sierra City / Yuba", lat: 39.567, lon: -120.629, group: "Day drives" },
  { name: "Carson Pass", lat: 38.694, lon: -119.986, group: "Day drives" },
  { name: "Ebbetts Pass", lat: 38.545, lon: -119.812, group: "Day drives" },
  { name: "Plumas NF · Quincy", lat: 39.937, lon: -120.947, group: "Day drives" },
  { name: "Lassen NF", lat: 40.487, lon: -121.407, group: "Day drives" },
  { name: "Eastern Sierra · June Lake", lat: 37.779, lon: -119.073, group: "Weekend trips" },
  { name: "Sonora Pass", lat: 38.328, lon: -119.636, group: "Weekend trips" },
  { name: "Lamoille Canyon · Ruby Mtns", lat: 40.652, lon: -115.472, group: "Weekend trips" },
];

const EARTH_R_KM = 6371;
function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(h));
}

/**
 * Pick candidate spots within `maxKm` of the user. Returns up to `max` spots.
 * Always includes the user's current location as the first candidate.
 */
export function selectCandidates(
  userLat: number,
  userLon: number,
  userLabel: string,
  maxKm = 250,
  max = 10
): { name: string; lat: number; lon: number; group?: string; distanceKm: number }[] {
  const here = { lat: userLat, lon: userLon };
  // Filter presets within range and drop any that sit on top of the user
  // (within ~150m — covers "current location IS a preset" case).
  const scored = PRESETS.map((p) => ({
    ...p,
    distanceKm: haversineKm(here, { lat: p.lat, lon: p.lon }),
  }))
    .filter((p) => p.distanceKm <= maxKm && p.distanceKm > 0.15)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  // If the user's current location matches a preset name, use that name
  // ("Tahoe Meadows") instead of duplicating ("Current spot · Tahoe Meadows").
  const matchingPreset = PRESETS.find(
    (p) =>
      haversineKm(here, { lat: p.lat, lon: p.lon }) <= 0.15 ||
      p.name === userLabel
  );
  const currentName = matchingPreset
    ? matchingPreset.name
    : `Current spot · ${userLabel}`;

  return [
    {
      name: currentName,
      lat: userLat,
      lon: userLon,
      group: "Current",
      distanceKm: 0,
    },
    ...scored.slice(0, max - 1),
  ];
}

/**
 * Fetch weather + compute Spore Score for every candidate. Runs in parallel
 * with a small concurrency cap so we don't blow through Open-Meteo's rate limit.
 */
export async function scoreCandidates(
  candidates: ReturnType<typeof selectCandidates>,
  concurrency = 4
): Promise<CandidateSpot[]> {
  const out: CandidateSpot[] = new Array(candidates.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= candidates.length) return;
      const c = candidates[i];
      try {
        const weather = await fetchWeather(c.lat, c.lon);
        const reading = computeSporeScore(weather);
        out[i] = { ...c, weather, reading };
      } catch (e) {
        out[i] = {
          ...c,
          weather: [],
          reading: null,
          error: e instanceof Error ? e.message : "fetch failed",
        };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, worker)
  );
  return out;
}

interface AnalyzeOpts {
  apiKey: string;
  candidates: CandidateSpot[];
  regionLabel: string;
  regionFilterTerms: string[] | null;
  topN?: number;
}

export interface AnalyzeResult {
  spots: RankedSpot[];
  /** The exact prompt sent to Claude (for debug / "show me") */
  prompt: string;
  /** The raw response body from the Anthropic Messages API */
  raw: AnthropicMessageResponse;
}

interface AnthropicMessageResponse {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  stop_reason?: string;
  stop_sequence?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
  content: {
    type: string;
    text?: string;
    name?: string;
    input?: unknown;
  }[];
}

/**
 * Send the scored candidates + region's species catalog snippet to Claude
 * and ask for a ranked recommendation with reasoning.
 */
export async function analyzeSpotsWithClaude({
  apiKey,
  candidates,
  regionLabel,
  regionFilterTerms,
  topN = 3,
}: AnalyzeOpts): Promise<AnalyzeResult> {
  const month = new Date().getMonth() + 1;

  // Compact catalog for the prompt: only in-region, in-season species,
  // and only the fields the LLM needs to reason.
  const speciesSnippet = PNW_CATALOG
    .filter(
      (s) =>
        speciesInRegions(s, regionFilterTerms) &&
        s.fruitingMonths.includes(month)
    )
    .slice(0, 50)
    .map((s) => ({
      common: s.commonNames[0],
      scientific: s.scientific,
      edibility: s.edibility,
      trophic: s.trophicMode,
      hosts: s.hostTrees.slice(0, 4).map((h) => h.common),
      conditions: {
        minRain7d: s.conditions.minRain7d,
        idealDaysSinceRain: s.conditions.idealDaysSinceRain,
        tempRangeC: s.conditions.tempRangeC,
        humidityMinPct: s.conditions.humidityMinPct,
      },
    }));

  const candidateSnippet = candidates
    .filter((c) => c.reading)
    .map((c) => ({
      name: c.name,
      lat: Number(c.lat.toFixed(4)),
      lon: Number(c.lon.toFixed(4)),
      distanceKm: Number(c.distanceKm.toFixed(1)),
      score: c.reading!.score,
      rain7dMm: Number(c.reading!.rain7d.toFixed(0)),
      daysSinceRain: c.reading!.daysSinceRain,
      meanTempC: Number(c.reading!.tempToday.toFixed(0)),
      humidityPct: Number(c.reading!.humidityToday.toFixed(0)),
    }));

  const today = dayjs().format("MMMM D, YYYY");

  const prompt = `Today is ${today}.

You are an expert mycologist advising a forager in the **${regionLabel}** region.
They want to know which spot near them is the best bet for mushroom foraging
right now, given today's weather conditions at each candidate spot.

# Candidate spots (scored 0–100 using a "Spore Score" composite of rain, days-since-rain, humidity, temperature)

${JSON.stringify(candidateSnippet, null, 2)}

# Species fruiting this region this month

${JSON.stringify(speciesSnippet, null, 2)}

Call the \`report_spots\` tool with the top ${topN} spots, ranked best-first.
- Pick spots where conditions genuinely meet ≥1 species' requirements.
- Reasoning should be 2-3 sentences citing specific weather numbers and the species the conditions favor.
- Suggest 1-3 likely species per spot from the catalog above.
- If only 1-2 spots are viable, return fewer than ${topN}.
- If NONE are viable, call the tool with an empty array.`;

  const tool = {
    name: "report_spots",
    description: "Submit the ranked list of foraging spots back to the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        spots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Copy from candidate" },
              lat: { type: "number" },
              lon: { type: "number" },
              distanceKm: { type: "number" },
              score: { type: "number" },
              reasoning: {
                type: "string",
                description:
                  "2-3 sentences explaining the ranking, citing weather numbers",
              },
              likelySpecies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    commonName: { type: "string" },
                    scientific: { type: "string" },
                  },
                  required: ["commonName", "scientific"],
                },
              },
              cautions: {
                type: ["string", "null"],
                description: "Optional warning, or null",
              },
            },
            required: [
              "name",
              "lat",
              "lon",
              "distanceKm",
              "score",
              "reasoning",
              "likelySpecies",
            ],
          },
        },
      },
      required: ["spots"],
    },
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      tools: [tool],
      tool_choice: { type: "tool", name: "report_spots" },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = (await resp.json()) as AnthropicMessageResponse;

  const toolUse = data.content.find(
    (b) => b.type === "tool_use" && b.name === "report_spots"
  );
  const input = toolUse?.input as
    | { spots?: Omit<RankedSpot, "rank">[] }
    | undefined;
  if (!toolUse || !input || !Array.isArray(input.spots)) {
    throw new Error("Claude did not call report_spots with a spots array");
  }
  const spots: RankedSpot[] = input.spots.map((p, i) => ({
    rank: i + 1,
    ...p,
  }));

  return { spots, prompt, raw: data };
}
