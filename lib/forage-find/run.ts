/**
 * Forage Finder orchestration: season gate → candidate grid (+ burn interiors) → weather → terrain →
 * pre-score → tree cover for the top candidates → final score → top 5, spaced. Every network source
 * is injected (FindDeps) so node tests run offline, and each one degrades independently.
 */
import { burnAt, burnInteriorPoints, type BurnCollection, type BurnHit } from "./burns.ts";
import { fetchConditions, type Conditions } from "./conditions.ts";
import { haversineKm, type LatLon } from "./geo.ts";
import { candidateGrid, pickSpaced } from "./grid.ts";
import { fetchEvt, type EvtInfo } from "./landcover.ts";
import { placeLabel } from "./places.ts";
import { inSeasonNow, monthsText, seasonStatus, type HabitatProfile, type SeasonStatus } from "./profiles.ts";
import { FIND_CAUTION, scoreSpot, type Reason } from "./score.ts";
import { loadElevationSampler, snapToDrainage, terrainAt, type FetchTile, type TerrainPoint } from "./terrain.ts";

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

export interface FindDeps {
  fetchJson: FetchLike;
  fetchTile: FetchTile;
  loadBurns: () => Promise<BurnCollection | null>;
}

export type FindStep = "weather" | "terrain" | "trees" | "done";
export const RADII_KM = [15, 40, 80] as const;
export const DEFAULT_RADIUS_KM = 40;
const POOR_SCORE = 35;
const TREE_LOOKUPS = 15;

export interface FoundSpot {
  rank: number;
  lat: number;
  lon: number;
  score: number;
  label: string;
  elevationM: number | null;
  reasons: Reason[];
  cautions: string[];
  burn: BurnHit | null;
  cover: string | null;
}

export interface FindResult {
  version: 1;
  speciesId: string;
  speciesName: string;
  scientific: string;
  center: { lat: number; lon: number; label: string };
  radiusKm: number;
  /** When the search ran (ISO datetime). */
  at: string;
  /** Device-local date the search was for. */
  today: string;
  status: "ok" | "poor" | "out-of-season";
  season: { status: SeasonStatus; months: string; peak: string };
  /** One plain sentence for the top of the list. */
  message: string;
  /** Past-week conditions at the search centre (null if weather failed or out of season). */
  conditions: Conditions | null;
  spots: FoundSpot[];
  inSeasonNow: { id: string; name: string; peak: boolean }[];
  /** Per-source degradation notes ("Tree cover unavailable: scored without it"). */
  notes: string[];
  cautions: string[];
}

export interface FindOptions {
  profile: HabitatProfile;
  allProfiles: HabitatProfile[];
  center: { lat: number; lon: number; label?: string };
  radiusKm?: number;
  /** Device-local YYYY-MM-DD (useLocalToday / localIsoDate), never UTC. */
  today: string;
  deps: FindDeps;
  signal?: AbortSignal;
  onProgress?: (step: FindStep) => void;
  /** Candidate grid size (default 60). */
  gridTarget?: number;
  now?: Date;
}

function abortIf(signal?: AbortSignal) {
  if (signal?.aborted) {
    const e = new Error("Search cancelled");
    e.name = "AbortError";
    throw e;
  }
}

interface Cand extends LatLon {
  cond: Conditions | null;
  terrain: TerrainPoint | null;
  burn: BurnHit | null;
  evt?: EvtInfo | null | "unavailable";
  score: number;
}

export async function findForageSpots(o: FindOptions): Promise<FindResult> {
  const { profile: p, deps, signal } = o;
  const radiusKm = o.radiusKm ?? DEFAULT_RADIUS_KM;
  const month = Number(o.today.slice(5, 7));
  const nowYear = Number(o.today.slice(0, 4));
  const status = seasonStatus(p, month);
  const centerLabel = o.center.label || placeLabel(o.center.lat, o.center.lon);
  const base = {
    version: 1 as const,
    speciesId: p.id,
    speciesName: p.name,
    scientific: p.scientific,
    center: { lat: o.center.lat, lon: o.center.lon, label: centerLabel },
    radiusKm,
    at: (o.now ?? new Date()).toISOString(),
    today: o.today,
    season: { status, months: monthsText(p.months), peak: monthsText(p.peak) },
    inSeasonNow: inSeasonNow(o.allProfiles.filter((x) => x.id !== p.id), month, 6),
    cautions: [FIND_CAUTION, ...p.cautions],
  };

  if (status === "out") {
    o.onProgress?.("done");
    return {
      ...base,
      status: "out-of-season",
      message: `${p.name} fruit ${base.season.months}, so it's out of season now.`,
      conditions: null,
      spots: [],
      notes: [],
    };
  }

  const notes: string[] = [];
  let burns: BurnCollection | null = null;
  try {
    burns = await deps.loadBurns();
  } catch {
    if (p.burn === "prefers") notes.push("Burn perimeters unavailable: scored without them.");
  }
  abortIf(signal);

  // Candidates: the centre, a lattice over the radius, and burn interiors for burn-loving species.
  const grid = candidateGrid(o.center.lat, o.center.lon, radiusKm, o.gridTarget ?? 60).filter(
    (q) => haversineKm(q, o.center) > 0.05,
  );
  const pts: LatLon[] = [{ lat: o.center.lat, lon: o.center.lon }, ...grid];
  if (p.burn === "prefers") pts.push(...burnInteriorPoints(burns, o.center.lat, o.center.lon, radiusKm, nowYear, 3, 20));

  // Weather.
  o.onProgress?.("weather");
  let conds: (Conditions | null)[] = pts.map(() => null);
  try {
    conds = await fetchConditions(pts, o.today, deps.fetchJson, signal);
  } catch (e) {
    abortIf(signal);
    notes.push("Weather unavailable: scored on terrain, trees and season only.");
    void e;
  }
  abortIf(signal);

  // Terrain (snap to the drainage low point first when the species likes drainages).
  o.onProgress?.("terrain");
  const snap = p.drainage >= 0.4;
  const sample = await loadElevationSampler(pts, snap ? 750 : 350, deps.fetchTile, { signal });
  abortIf(signal);
  let terrainOk = 0;
  const cands: Cand[] = pts.map((pt, i) => {
    const at = snap ? snapToDrainage(sample, pt.lat, pt.lon, 400) : pt;
    const t = terrainAt(sample, at.lat, at.lon);
    if (t.elevationM != null) terrainOk++;
    return {
      lat: at.lat,
      lon: at.lon,
      cond: conds[i],
      terrain: t.elevationM != null ? t : null,
      burn: burnAt(at.lat, at.lon, burns, nowYear),
      score: 0,
    };
  });
  if (!terrainOk) notes.push("Terrain unavailable: scored without slope, drainage or elevation.");
  for (const c of cands) c.score = scoreSpot(p, month, c).score;

  // Tree cover for the best few (one request each).
  o.onProgress?.("trees");
  const top = pickSpaced(cands, TREE_LOOKUPS, 1);
  let treeFails = 0;
  let next = 0;
  const worker = async () => {
    while (next < top.length) {
      const c = top[next++];
      if (signal?.aborted) return;
      try {
        c.evt = await fetchEvt(c.lat, c.lon, deps.fetchJson, signal);
      } catch {
        c.evt = "unavailable";
        treeFails++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, top.length) }, worker));
  abortIf(signal);
  if (top.length && treeFails === top.length) notes.push("Tree cover unavailable: scored without it.");
  else if (treeFails) notes.push(`Tree cover missing for ${treeFails} of ${top.length} spots.`);

  const scored = top.map((c) => ({ c, s: scoreSpot(p, month, c) })).map(({ c, s }) => ({ ...c, score: s.score, s }));
  const best = pickSpaced(scored, 5, 2);
  const spots: FoundSpot[] = best.map((b, i) => ({
    rank: i + 1,
    lat: Math.round(b.lat * 1e5) / 1e5,
    lon: Math.round(b.lon * 1e5) / 1e5,
    score: b.score,
    label: placeLabel(b.lat, b.lon),
    elevationM: b.terrain?.elevationM != null ? Math.round(b.terrain.elevationM) : (b.cond?.elevationM ?? null),
    reasons: b.s.reasons,
    cautions: b.s.cautions.filter((c) => !p.cautions.includes(c)),
    burn: b.burn,
    cover: b.evt && b.evt !== "unavailable" ? b.evt.name : null,
  }));
  o.onProgress?.("done");

  const poor = !spots.length || spots[0].score < POOR_SCORE;
  const frozen = best[0]?.s.frozen;
  const why = frozen
    ? "frozen ground or snow across the area"
    : (best[0]?.s.reasons.find((r) => !r.good)?.text.toLowerCase() ?? "nothing scores well");
  return {
    ...base,
    status: poor ? "poor" : "ok",
    message: poor
      ? `Poor odds for ${p.name} right now: ${why}. These are the best of what's around.`
      : `Best ground for ${p.name} within ${radiusKm} km of ${centerLabel}.`,
    conditions: conds[0],
    spots,
    notes,
  };
}
