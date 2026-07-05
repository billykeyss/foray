import dayjs from "dayjs";

export interface DailyWeather {
  time: string;
  tempMax: number;
  tempMin: number;
  tempMean: number;
  precipitation: number;
  windSpeed: number;
  humidity: number;
  pressure: number;
}

export interface SporeReading {
  score: number;
  label: string;
  hook: string;
  blurb: string;
  daysSinceRain: number;
  rain7d: number;
  humidityToday: number;
  tempToday: number;
}

type Band = "prime" | "fertile" | "hopeful" | "dry" | "barren";

const HOOKS: Record<Band, string[]> = {
  prime: [
    "looks fertile.",
    "is a flush day.",
    "smells like rain.",
    "wants boots on.",
    "is mycelium weather.",
    "is the day.",
  ],
  fertile: [
    "is fertile.",
    "is worth the walk.",
    "is good ground.",
    "should pop.",
    "is greening.",
    "is generous.",
  ],
  hopeful: [
    "is hopeful.",
    "is on the edge.",
    "is waiting.",
    "is almost there.",
    "needs another inch.",
    "is gathering itself.",
  ],
  dry: [
    "is drying out.",
    "is thirsty.",
    "is going crisp.",
    "is fading.",
    "is past it.",
    "is asking for rain.",
  ],
  barren: [
    "is barren.",
    "is bone-dry.",
    "is sleeping.",
    "won't deliver.",
    "is closed for business.",
    "is dust-bound.",
  ],
};

const BLURBS: Record<Band, string[]> = {
  prime: [
    "Walk before the dew lifts.",
    "Bring two baskets.",
    "Today, not tomorrow.",
    "The duff is wet through.",
    "Quiet feet, sharp eyes.",
  ],
  fertile: [
    "Worth the trip.",
    "Check your usual oak.",
    "Bring a basket, just in case.",
    "Look low, look slow.",
    "The understory is awake.",
  ],
  hopeful: [
    "Watch the next storm.",
    "Not yet — but soon.",
    "The duff is damp, not soaked.",
    "Scout, don't harvest.",
    "Mark the spots.",
  ],
  dry: [
    "The duff hasn't drunk.",
    "Save the basket.",
    "Wait for weather.",
    "The crust is hard.",
    "Read, don't walk.",
  ],
  barren: [
    "Save your boots.",
    "Nothing's stirring.",
    "Check the forecast.",
    "Read about it instead.",
    "Wait for a real storm.",
  ],
};

const LABELS: Record<Band, string> = {
  prime: "Prime fruiting window",
  fertile: "Fertile",
  hopeful: "Hopeful",
  dry: "Dry",
  barren: "Barren",
};

/**
 * Pick a stable variant per (date, key). Same day → same phrase.
 * Different day → likely different phrase. Different key → independent.
 */
function pickDaily<T>(arr: T[], key: string): T {
  const day = new Date();
  const seed = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}-${key}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return arr[Math.abs(h) % arr.length];
}

function bandFor(score: number): Band {
  if (score >= 80) return "prime";
  if (score >= 65) return "fertile";
  if (score >= 45) return "hopeful";
  if (score >= 25) return "dry";
  return "barren";
}

export async function fetchWeather(
  lat: number,
  lon: number
): Promise<DailyWeather[]> {
  const startDate = dayjs().subtract(10, "day").format("YYYY-MM-DD");
  const endDate = dayjs().add(10, "day").format("YYYY-MM-DD");

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,windspeed_10m_max,relative_humidity_2m_mean,surface_pressure_mean&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo: ${await res.text()}`);
  const data = await res.json();

  return data.daily.time.map((time: string, i: number) => ({
    time,
    tempMax: data.daily.temperature_2m_max[i],
    tempMin: data.daily.temperature_2m_min[i],
    tempMean: data.daily.temperature_2m_mean[i],
    precipitation: data.daily.precipitation_sum[i] ?? 0,
    windSpeed: data.daily.windspeed_10m_max[i] ?? 0,
    humidity: data.daily.relative_humidity_2m_mean[i] ?? 0,
    pressure: data.daily.surface_pressure_mean[i] ?? 0,
  }));
}

/**
 * Composite Spore Score (0–100) — how favorable conditions are for fruiting.
 *
 * Weights:
 *  - 45%  cumulative rain over last 7 days  (peaks at 25mm)
 *  - 25%  days-since-rain in the sweet spot (3–6d ideal, drops outside)
 *  - 15%  mean relative humidity            (peaks at 80%+)
 *  - 15%  mean temperature                  (peaks at 12–18°C)
 */
export function computeSporeScore(days: DailyWeather[]): SporeReading {
  const today = dayjs().format("YYYY-MM-DD");
  const todayIdx = Math.max(
    0,
    days.findIndex((d) => d.time === today)
  );
  const past7 = days.slice(Math.max(0, todayIdx - 6), todayIdx + 1);

  const rain7d = past7.reduce((s, d) => s + d.precipitation, 0);

  let daysSinceRain = past7.length;
  for (let i = past7.length - 1; i >= 0; i--) {
    if (past7[i].precipitation >= 2) {
      daysSinceRain = past7.length - 1 - i;
      break;
    }
  }

  const todayDay = days[todayIdx] ?? days[0];
  const humidityToday = todayDay.humidity;
  const tempToday = todayDay.tempMean;

  // 1. Rain: peaks at 25mm cumulative
  const rainScore = Math.min(rain7d / 25, 1) * 100;

  // 2. Days since rain: ideal 3–6 days
  let dsrScore: number;
  if (daysSinceRain < 1) dsrScore = 30;
  else if (daysSinceRain <= 2) dsrScore = 60;
  else if (daysSinceRain <= 6) dsrScore = 100;
  else if (daysSinceRain <= 9) dsrScore = 65;
  else dsrScore = 30;

  // 3. Humidity: peaks at 80%
  const humidityScore = Math.min(humidityToday / 80, 1) * 100;

  // 4. Temperature: peaks 12–18C
  let tempScore: number;
  if (tempToday < 4 || tempToday > 26) tempScore = 25;
  else if (tempToday >= 12 && tempToday <= 18) tempScore = 100;
  else if (tempToday < 12) tempScore = 50 + ((tempToday - 4) / 8) * 50;
  else tempScore = 100 - ((tempToday - 18) / 8) * 75;

  const finalScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        rainScore * 0.45 +
          dsrScore * 0.25 +
          humidityScore * 0.15 +
          tempScore * 0.15
      )
    )
  );

  const band = bandFor(finalScore);

  return {
    score: finalScore,
    label: LABELS[band],
    hook: pickDaily(HOOKS[band], `hook-${band}`),
    blurb: pickDaily(BLURBS[band], `blurb-${band}`),
    daysSinceRain,
    rain7d,
    humidityToday,
    tempToday,
  };
}

import { PNW_CATALOG } from "./species-catalog";
import type { MushroomSpecies } from "./species-types";
import type { Forageable } from "./forageable";

export type { MushroomSpecies } from "./species-types";

export interface SpeciesMatch {
  match: number;
  total: number;
  criteria: { label: string; met: boolean }[];
}

export function scoreSpecies(
  s: MushroomSpecies,
  r: SporeReading
): SpeciesMatch {
  const c = s.conditions;
  const month = new Date().getMonth() + 1;
  const criteria = [
    {
      label: `Rain ${r.rain7d.toFixed(0)}mm`,
      met: r.rain7d >= c.minRain7d,
    },
    {
      label: `Day ${r.daysSinceRain} after`,
      met:
        r.daysSinceRain >= c.idealDaysSinceRain[0] &&
        r.daysSinceRain <= c.idealDaysSinceRain[1],
    },
    {
      label: `Temp ${r.tempToday.toFixed(0)}°C`,
      met: r.tempToday >= c.tempRangeC[0] && r.tempToday <= c.tempRangeC[1],
    },
    {
      label: `RH ${r.humidityToday.toFixed(0)}%`,
      met: c.humidityMinPct == null || r.humidityToday >= c.humidityMinPct,
    },
    {
      label: "In season",
      met: s.fruitingMonths.includes(month),
    },
  ];
  return {
    match: criteria.filter((x) => x.met).length,
    total: criteria.length,
    criteria,
  };
}

/**
 * Pick the best-matching species from the catalog.
 *
 * Multiple hard gates:
 *  1. Overall Spore Score must be ≥ 45 (no recommendations on barren/dry days,
 *     even for species that ostensibly tolerate dry conditions)
 *  2. Species must be in season (current month in fruitingMonths)
 *  3. 7-day rainfall must meet the species' `minRain7d` AND be ≥ 5mm
 *     (catches snow-fruiters with minRain7d=0 when there's no precip)
 *  4. At least 3 of 5 ranked criteria must be met
 *
 * If `regionFilter` is provided, only species whose `regionsPNW` strings match
 * (case-insensitive substring) are considered.
 */
export function suggestSpecies(
  reading: SporeReading,
  regionFilter?: string[] | null
): MushroomSpecies | null {
  // Hard floor on overall score — don't surface anything on truly bad days
  if (reading.score < 45) return null;

  const month = new Date().getMonth() + 1;

  const ranked = PNW_CATALOG
    .filter((s) => speciesInRegions(s, regionFilter))
    .map((s) => {
      const score = scoreSpecies(s, reading);
      const rainMet =
        reading.rain7d >= Math.max(s.conditions.minRain7d, 5);
      const inSeason = s.fruitingMonths.includes(month);
      return { species: s, score, rainMet, inSeason };
    })
    .filter((r) => r.inSeason && r.rainMet)
    .sort((a, b) => {
      if (b.score.match !== a.score.match) {
        return b.score.match - a.score.match;
      }
      const aChoice = a.species.edibility === "choice" ? 1 : 0;
      const bChoice = b.species.edibility === "choice" ? 1 : 0;
      return bChoice - aChoice;
    });

  const top = ranked[0];
  if (!top || top.score.match < 3) return null;
  return top.species;
}

/** Case-insensitive match: any of the entry's regions contains any filter term.
 *  Typed against `Forageable` so mushrooms, trees and plants all reuse it. */
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

/**
 * Top N matches, including weaker ones — used by a "what could be fruiting"
 * list. Filtered to in-season species (and optionally to active region)
 * and ranked by criteria met.
 */
export function suggestSpeciesList(
  reading: SporeReading,
  filterTermsOrLimit?: string[] | null | number,
  limitArg = 5
): MushroomSpecies[] {
  // Back-compat: callers used to pass just `(reading, limit)`.
  let filterTerms: string[] | null = null;
  let limit = limitArg;
  if (typeof filterTermsOrLimit === "number") {
    limit = filterTermsOrLimit;
  } else if (Array.isArray(filterTermsOrLimit)) {
    filterTerms = filterTermsOrLimit;
  }

  const month = new Date().getMonth() + 1;
  return PNW_CATALOG
    .filter((s) => s.fruitingMonths.includes(month))
    .filter((s) => speciesInRegions(s, filterTerms))
    .map((s) => ({ s, m: scoreSpecies(s, reading).match }))
    .sort((a, b) => b.m - a.m)
    .slice(0, limit)
    .map((r) => r.s);
}
