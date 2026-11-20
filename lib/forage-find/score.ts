/**
 * Habitat scoring for one candidate spot. Weighted factors 0-1 → 0-100. A factor whose data is
 * missing (no weather, tree lookup failed, species has no elevation band) is skipped and the rest are
 * re-weighted, so a missing source never reads as "bad ground". Pure; unit-tested.
 */
import type { BurnHit } from "./burns.ts";
import type { Conditions } from "./conditions.ts";
import type { EvtInfo } from "./landcover.ts";
import { evtShortName } from "./landcover.ts";
import type { HabitatProfile } from "./profiles.ts";
import { seasonStatus } from "./profiles.ts";
import type { TerrainPoint } from "./terrain.ts";
import { terrainKind } from "./terrain.ts";
import type { Compass } from "./geo.ts";

export const FIND_CAUTION = "Check land status and fire closures; verify ID before eating.";

export const WEIGHTS = { season: 15, elevation: 15, moisture: 20, soilTemp: 15, host: 20, terrain: 10, burn: 10 } as const;
export type Factor = keyof typeof WEIGHTS;

export interface Reason {
  factor: Factor | "freeze";
  text: string;
  /** Helps (true) or counts against (false) the spot. */
  good: boolean;
  /** Weighted contribution, for ordering. */
  weight: number;
}

export interface SpotInput {
  lat: number;
  lon: number;
  terrain: TerrainPoint | null;
  cond: Conditions | null;
  /** undefined = not looked up yet (pre-score); "unavailable" = lookup failed; null = no data there. */
  evt?: EvtInfo | null | "unavailable";
  burn: BurnHit | null;
}

export interface SpotScore {
  score: number;
  reasons: Reason[];
  cautions: string[];
  factors: Partial<Record<Factor, number>>;
  frozen: boolean;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const FACING: Record<Compass, string> = {
  N: "North-facing", NE: "Northeast-facing", E: "East-facing", SE: "Southeast-facing",
  S: "South-facing", SW: "Southwest-facing", W: "West-facing", NW: "Northwest-facing",
};
const OPPOSITE: Record<Compass, Compass> = { N: "S", NE: "SW", E: "W", SE: "NW", S: "N", SW: "NE", W: "E", NW: "SE" };

function hostFactor(p: HabitatProfile, e: EvtInfo): { f: number; text: string } {
  const hay = `${e.name} ${e.group} ${e.coverType}`.toLowerCase();
  const short = evtShortName(e);
  if (p.hosts.some((k) => hay.includes(k))) return { f: 1, text: short };
  const lf = e.lifeform;
  if (lf === "Water" || lf === "Snow-Ice" || lf === "Barren") return { f: 0, text: short };
  if (p.substrate === "open") {
    if (lf === "Herb" || lf === "Shrub" || lf === "Developed" || lf === "Agriculture") return { f: 0.6, text: short };
    return { f: 0.3, text: `Wooded: ${short}` };
  }
  if (!p.hosts.length) {
    return lf === "Tree" ? { f: 0.7, text: short } : { f: 0.2, text: `Few trees: ${short}` };
  }
  if (lf === "Tree") return { f: 0.25, text: `Not its host trees: ${short}` };
  if (lf === "Shrub") return { f: 0.1, text: `No host trees: ${short}` };
  return { f: 0, text: `No host trees: ${short}` };
}

/** Burn-loving species (morels) weigh the burn far more: it is most of what makes a spot. */
const BURN_PREFERS_WEIGHT = 25;

export function scoreSpot(p: HabitatProfile, month: number, s: SpotInput): SpotScore {
  const w = (k: Factor) => (k === "burn" && p.burn === "prefers" ? BURN_PREFERS_WEIGHT : WEIGHTS[k]);
  const factors: Partial<Record<Factor, number>> = {};
  const reasons: Reason[] = [];
  const cautions = [...p.cautions];
  /** Record a factor; `good` defaults to f ≥ 0.6 (a "too cold" reason is never good, however close). */
  const add = (factor: Factor, f: number, text: string | null, good: boolean = f >= 0.6) => {
    factors[factor] = clamp(f);
    if (text) reasons.push({ factor, text, good, weight: w(factor) * (good ? clamp(f) : 1 - clamp(f)) });
  };

  // Season (the caller has already gated out-of-season species; still scored for ordering).
  const season = seasonStatus(p, month);
  add("season", season === "peak" ? 1 : season === "in" ? 0.7 : 0, season === "peak" ? "Peak season" : season === "in" ? "In season" : "Out of season");

  // Elevation band.
  const elev = s.terrain?.elevationM ?? s.cond?.elevationM ?? null;
  if (p.elevationM && elev != null) {
    const { min, max } = p.elevationM;
    const off = elev < min ? min - elev : elev > max ? elev - max : 0;
    add("elevation", 1 - off / 400, off === 0 ? "In its elevation range" : elev < min ? "Below its usual elevation" : "Above its usual elevation", off === 0);
  }

  // Moisture: past-week rain, soil moisture, humidity.
  const c = s.cond;
  if (c) {
    const need = Math.max(5, p.minRain7dMm * (p.moisture === "low" ? 0.5 : p.moisture === "high" ? 1.2 : 1));
    const rainF = clamp(c.rain7dMm / need);
    const soilF = c.soilMoisture == null ? null : clamp((c.soilMoisture - 0.08) / (p.moisture === "low" ? 0.12 : 0.17));
    const rhF = c.humidityPct == null ? null : clamp((c.humidityPct - 40) / 40);
    const parts: [number, number][] = [[rainF, 0.45]];
    if (soilF != null) parts.push([soilF, 0.4]);
    if (rhF != null) parts.push([rhF, 0.15]);
    const f = parts.reduce((a, [v, w]) => a + v * w, 0) / parts.reduce((a, [, w]) => a + w, 0);
    const rainText = c.rain7dMm >= 1 ? `${Math.round(c.rain7dMm)} mm rain past 7 d` : "No rain past 7 d";
    add("moisture", f, rainText);
    if (soilF != null && soilF < 0.3) reasons.push({ factor: "moisture", text: "Dry soil", good: false, weight: 4 });
  }

  // Soil temperature window.
  if (c?.soilTempC != null) {
    const [lo, hi] = p.soilTempC;
    const t = c.soilTempC;
    const off = t < lo ? lo - t : t > hi ? t - hi : 0;
    const label = `Soil ${Math.round(t)} °C`;
    add("soilTemp", 1 - off / 5, off === 0 ? label : t < lo ? `${label}: too cold` : `${label}: too warm`, off === 0);
  }

  // Host trees / cover (only once looked up).
  let water = false;
  if (s.evt && s.evt !== "unavailable") {
    const h = hostFactor(p, s.evt);
    add("host", h.f, h.text);
    water = s.evt.lifeform === "Water";
    if (s.evt.lifeform === "Developed" || /Developed/.test(s.evt.physiognomy)) cautions.push("Developed land: likely private property.");
  }
  // Dead-flat DEM (slope and relief ~0 at 30 m) is almost always a lake surface.
  const flat = !!s.terrain && s.terrain.slopeDeg < 0.3 && Math.abs(s.terrain.tpiM) < 0.3;

  // Terrain: drainage preference and slope facing.
  if (s.terrain) {
    const kind = terrainKind(s.terrain.tpiM);
    const dir = kind === "drainage" ? 1 : kind === "ridge" ? -1 : 0;
    let f = 0.5 + 0.4 * p.drainage * dir;
    const t = s.terrain.aspect;
    if (p.aspects && t) f += p.aspects.includes(t) ? 0.25 : p.aspects.includes(OPPOSITE[t]) ? -0.2 : 0;
    const bits: string[] = [];
    if (kind === "drainage") bits.push("Drainage bottom");
    if (kind === "ridge") bits.push("Ridge");
    const [first, ...rest] = bits;
    if (flat) f = 0.1;
    // A middling terrain score (0.4-0.6) is neutral: scored, but not worth a chip either way.
    const neutral = !flat && f >= 0.4 && f < 0.6;
    add("terrain", f, neutral || (!first && !flat) ? null : flat ? "Dead-flat: likely open water" : first!);
    for (const b of rest) reasons.push({ factor: "terrain", text: b, good: f >= 0.6, weight: 1 });
    // Facing is only a reason when the species has a preference.
    if (p.aspects && t && (p.aspects.includes(t) || p.aspects.includes(OPPOSITE[t])))
      reasons.push({ factor: "terrain", text: FACING[t], good: p.aspects.includes(t), weight: 2 });
  }

  // Burns.
  const b = s.burn;
  if (p.burn === "prefers") {
    if (!b) add("burn", 0.15, "No recent burn");
    else {
      const f = b.ageYears === 1 ? 1 : b.ageYears === 2 ? 0.6 : b.ageYears <= 0 ? 0.3 : b.ageYears === 3 ? 0.3 : 0.15;
      add("burn", f, b.ageYears <= 0 ? `Burned ${b.year} · ${b.name}: likely too fresh` : `Burned ${b.year} · ${b.name}`);
    }
  } else if (b && b.ageYears <= 2 && p.substrate === "soil") {
    add("burn", 0.15, `Burned ${b.year} · ${b.name}`);
    cautions.push("Recently burned: host trees may be dead.");
  }

  let total = 0;
  let wsum = 0;
  for (const [k, v] of Object.entries(factors) as [Factor, number][]) {
    total += w(k) * v;
    wsum += w(k);
  }
  let score = wsum ? (total / wsum) * 100 : 0;

  // Mycorrhizal / host-bound species don't fruit without their trees: a known host mismatch
  // scales the whole score down rather than costing just its weight.
  if (factors.host != null && p.substrate !== "open" && p.hosts.length) score *= 0.35 + 0.65 * factors.host;
  if (water) score = 0;

  // Snow / freeze proxy.
  const frozen = (c?.soilTempC != null && c.soilTempC < 2) || (c?.maxTemp3dC != null && c.maxTemp3dC < 3);
  if (frozen) {
    score *= 0.35;
    reasons.push({ factor: "freeze", text: "Frozen ground or snow likely", good: false, weight: 100 });
  }

  reasons.sort((a, b) => Number(b.good) - Number(a.good) || b.weight - a.weight);
  return { score: Math.round(score), reasons, cautions, factors, frozen };
}
