/** Past-week weather and soil at many points in one Open-Meteo request (chunked to ≤50 points). */
import type { LatLon } from "./geo.ts";
import { FETCH_TIMEOUT_MS, timedSignal } from "./net.ts";

export interface Conditions {
  /** Rain over the 7 full days before today, mm (today is excluded: it is partly forecast). */
  rain7dMm: number;
  /** Mean daily relative humidity over the same 7 days, %. */
  humidityPct: number | null;
  /** Mean volumetric soil moisture 3-9 cm, m³/m³. */
  soilMoisture: number | null;
  /** Mean soil temperature at 6 cm, °C. */
  soilTempC: number | null;
  /** Mean daily max air temperature over the last 3 days, °C (snow / freeze proxy). */
  maxTemp3dC: number | null;
  /** Open-Meteo's model elevation for the cell, m. */
  elevationM: number | null;
}

const BASE = "https://api.open-meteo.com/v1/forecast";
export const CHUNK = 50;

export function buildOpenMeteoUrl(points: LatLon[]): string {
  return (
    `${BASE}?latitude=${points.map((p) => p.lat.toFixed(4)).join(",")}` +
    `&longitude=${points.map((p) => p.lon.toFixed(4)).join(",")}` +
    "&past_days=7&forecast_days=3" +
    "&daily=precipitation_sum,relative_humidity_2m_mean,temperature_2m_max,temperature_2m_min" +
    "&hourly=soil_moisture_3_to_9cm,soil_temperature_6cm&timezone=auto"
  );
}

interface OmLocation {
  elevation?: number;
  daily?: Record<string, (number | null)[] | string[]>;
  hourly?: Record<string, (number | null)[] | string[]>;
}

/** YYYY-MM-DD `n` days before `iso` (calendar arithmetic in UTC, safe for dates only). */
function minusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
const r3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);

/** Aggregate one location's response around `todayIso` (the device-local date). */
export function parseOpenMeteo(loc: OmLocation, todayIso: string): Conditions {
  const from7 = minusDays(todayIso, 6);
  const from3 = minusDays(todayIso, 2);
  const dTime = (loc.daily?.time ?? []) as string[];
  const col = (src: Record<string, unknown> | undefined, k: string) => ((src?.[k] ?? []) as (number | null)[]);
  const pick = (vals: (number | null)[], times: string[], from: string, key: (t: string) => string = (t) => t) =>
    vals.filter((v, i) => v != null && Number.isFinite(v) && key(times[i]) >= from && key(times[i]) <= todayIso) as number[];

  // Rain: the 7 full days before today. Today's daily total is mostly forecast, so it's left out.
  const yesterday = minusDays(todayIso, 1);
  const rainVals = col(loc.daily, "precipitation_sum");
  const rain = rainVals.filter((v, i) => v != null && Number.isFinite(v) && dTime[i] >= minusDays(todayIso, 7) && dTime[i] <= yesterday) as number[];
  const rh = pick(col(loc.daily, "relative_humidity_2m_mean"), dTime, from7);
  const tmax = pick(col(loc.daily, "temperature_2m_max"), dTime, from3);
  const hTime = (loc.hourly?.time ?? []) as string[];
  const day = (t: string) => (t ?? "").slice(0, 10);
  const sm = pick(col(loc.hourly, "soil_moisture_3_to_9cm"), hTime, from7, day);
  const st = pick(col(loc.hourly, "soil_temperature_6cm"), hTime, from7, day);
  return {
    rain7dMm: Math.round(rain.reduce((a, b) => a + b, 0) * 10) / 10,
    humidityPct: r1(mean(rh)) == null ? null : Math.round(mean(rh)!),
    soilMoisture: r3(mean(sm)),
    soilTempC: r1(mean(st)),
    maxTemp3dC: r1(mean(tmax)),
    elevationM: Number.isFinite(loc.elevation) ? (loc.elevation as number) : null,
  };
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

/** Conditions for every point, in order. Throws if any chunk fails (caller degrades). */
export async function fetchConditions(points: LatLon[], todayIso: string, fetchImpl: FetchLike, signal?: AbortSignal, timeoutMs = FETCH_TIMEOUT_MS): Promise<Conditions[]> {
  const out: Conditions[] = [];
  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
    const res = await fetchImpl(buildOpenMeteoUrl(chunk), { signal: timedSignal(signal, timeoutMs) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status ?? "error"}`);
    const body = await res.json();
    const locs = (Array.isArray(body) ? body : [body]) as OmLocation[];
    if (locs.length !== chunk.length) throw new Error(`Open-Meteo returned ${locs.length} of ${chunk.length} locations`);
    for (const l of locs) out.push(parseOpenMeteo(l, todayIso));
  }
  return out;
}
