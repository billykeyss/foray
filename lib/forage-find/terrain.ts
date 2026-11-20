/**
 * Terrain from AWS terrarium DEM tiles: decode, sample (bilinear), slope / aspect / topographic
 * position index, and "snap to the local drainage low point". Tile loading is injected so node tests
 * never touch the network; the browser loader (decodeTileInBrowser) lives at the bottom.
 */
import { compass8, lonLatToTilePixel, offsetM, type Compass, type LatLon } from "./geo.ts";
import { timedSignal } from "./net.ts";

export const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const DEM_ZOOM = 12;

export interface DecodedTile {
  width: number;
  height: number;
  /** RGBA bytes, row-major. */
  data: Uint8ClampedArray | Uint8Array;
}
export type FetchTile = (z: number, x: number, y: number) => Promise<DecodedTile | null>;
/** Elevation in metres at a point, or null where no tile is loaded. */
export type ElevationSampler = (lat: number, lon: number) => number | null;

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Tiles (z/x/y) needed to sample every point and its `radiusM` neighbourhood. */
export function tilesFor(points: LatLon[], radiusM: number, z = DEM_ZOOM): [number, number, number][] {
  const seen = new Map<string, [number, number, number]>();
  for (const p of points) {
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 0],
    ]) {
      const q = offsetM(p, dx * radiusM, dy * radiusM);
      const t = lonLatToTilePixel(q.lon, q.lat, z);
      seen.set(`${t.tx}/${t.ty}`, [z, t.tx, t.ty]);
    }
  }
  return [...seen.values()];
}

/** A sampler over already-decoded tiles keyed "x/y" at zoom z. Bilinear within a tile. */
export function makeSampler(tiles: Map<string, DecodedTile>, z = DEM_ZOOM): ElevationSampler {
  const elevAt = (tx: number, ty: number, ix: number, iy: number): number | null => {
    // Pixels past an edge belong to the neighbouring tile.
    while (ix < 0) { ix += 256; tx -= 1; }
    while (ix > 255) { ix -= 256; tx += 1; }
    while (iy < 0) { iy += 256; ty -= 1; }
    while (iy > 255) { iy -= 256; ty += 1; }
    const t = tiles.get(`${tx}/${ty}`);
    if (!t) return null;
    const sx = Math.min(t.width - 1, Math.round((ix * t.width) / 256));
    const sy = Math.min(t.height - 1, Math.round((iy * t.height) / 256));
    const i = (sy * t.width + sx) * 4;
    return decodeTerrarium(t.data[i], t.data[i + 1], t.data[i + 2]);
  };
  return (lat, lon) => {
    const { tx, ty, px, py } = lonLatToTilePixel(lon, lat, z);
    const x0 = Math.floor(px - 0.5);
    const y0 = Math.floor(py - 0.5);
    const fx = px - 0.5 - x0;
    const fy = py - 0.5 - y0;
    const a = elevAt(tx, ty, x0, y0);
    const b = elevAt(tx, ty, x0 + 1, y0);
    const c = elevAt(tx, ty, x0, y0 + 1);
    const d = elevAt(tx, ty, x0 + 1, y0 + 1);
    if (a == null || b == null || c == null || d == null) return a ?? b ?? c ?? d;
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  };
}

/** Fetch every tile the points need (bounded concurrency) and return a sampler. Failed tiles → null samples. */
export async function loadElevationSampler(
  points: LatLon[],
  radiusM: number,
  fetchTile: FetchTile,
  opts: { z?: number; concurrency?: number; signal?: AbortSignal } = {},
): Promise<ElevationSampler> {
  const z = opts.z ?? DEM_ZOOM;
  const list = tilesFor(points, radiusM, z);
  const tiles = new Map<string, DecodedTile>();
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      if (opts.signal?.aborted) return;
      const [tz, x, y] = list[i++];
      try {
        const t = await fetchTile(tz, x, y);
        if (t) tiles.set(`${x}/${y}`, t);
      } catch {
        /* a missing tile just leaves a hole */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 6, list.length || 1) }, worker));
  return makeSampler(tiles, z);
}

export interface TerrainPoint {
  elevationM: number | null;
  slopeDeg: number;
  /** Downslope-facing direction; null on flat ground (< 3°). */
  aspect: Compass | null;
  /** Elevation minus the mean of a ~300 m ring: negative = hollow / drainage, positive = ridge. */
  tpiM: number;
}

/** Slope and aspect from central differences at ±30 m, TPI against an 8-point 300 m ring. */
export function terrainAt(sample: ElevationSampler, lat: number, lon: number, ringM = 300): TerrainPoint {
  const o = { lat, lon };
  const at = (dx: number, dy: number) => {
    const p = offsetM(o, dx, dy);
    return sample(p.lat, p.lon);
  };
  const z = sample(lat, lon);
  const h = 30;
  const e = at(h, 0), w = at(-h, 0), n = at(0, h), s = at(0, -h);
  let slopeDeg = 0;
  let aspect: Compass | null = null;
  if (e != null && w != null && n != null && s != null) {
    const dzdx = (e - w) / (2 * h); // rise to the east
    const dzdy = (n - s) / (2 * h); // rise to the north
    slopeDeg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    if (slopeDeg >= 3) {
      // The ground faces downhill: the direction of -gradient.
      const facing = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI;
      aspect = compass8((facing + 360) % 360);
    }
  }
  let sum = 0;
  let count = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const v = at(Math.sin(a) * ringM, Math.cos(a) * ringM);
    if (v != null) {
      sum += v;
      count++;
    }
  }
  const tpiM = z != null && count ? z - sum / count : 0;
  return { elevationM: z, slopeDeg: Math.round(slopeDeg * 10) / 10, aspect, tpiM: Math.round(tpiM * 10) / 10 };
}

export type TerrainKind = "drainage" | "ridge" | "slope";
export function terrainKind(tpiM: number): TerrainKind {
  if (tpiM <= -8) return "drainage";
  if (tpiM >= 8) return "ridge";
  return "slope";
}

/** The lowest sampled point within `radiusM` (grid every `stepM`): the local drainage bottom. */
export function snapToDrainage(sample: ElevationSampler, lat: number, lon: number, radiusM = 400, stepM = 50): LatLon {
  let best = { lat, lon };
  let bestZ = sample(lat, lon);
  if (bestZ == null) return best;
  const o = { lat, lon };
  for (let dy = -radiusM; dy <= radiusM; dy += stepM) {
    for (let dx = -radiusM; dx <= radiusM; dx += stepM) {
      if (dx * dx + dy * dy > radiusM * radiusM) continue;
      const p = offsetM(o, dx, dy);
      const z = sample(p.lat, p.lon);
      if (z != null && z < bestZ - 0.5) {
        bestZ = z;
        best = p;
      }
    }
  }
  return best;
}

/** Browser tile loader: fetch the PNG and read its pixels via createImageBitmap + (Offscreen)Canvas. */
export function browserFetchTile(fetchImpl: typeof fetch = fetch, signal?: AbortSignal): FetchTile {
  return async (z, x, y) => {
    const url = DEM_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    const res = await fetchImpl(url, { signal: timedSignal(signal) });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const w = bmp.width;
    const hgt = bmp.height;
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (typeof OffscreenCanvas !== "undefined") {
      ctx = new OffscreenCanvas(w, hgt).getContext("2d");
    } else {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = hgt;
      ctx = c.getContext("2d");
    }
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    return { width: w, height: hgt, data: ctx.getImageData(0, 0, w, hgt).data };
  };
}
