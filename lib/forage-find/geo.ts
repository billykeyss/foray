/** Small spherical / web-mercator helpers for Forage Finder. Pure; node-testable. */

export interface LatLon {
  lat: number;
  lon: number;
}

export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point `km` from (lat, lon) along initial bearing `bearing` (degrees clockwise from north). */
export function destination(lat: number, lon: number, bearing: number, km: number): LatLon {
  const d = km / R_KM;
  const b = rad(bearing);
  const la1 = rad(lat);
  const lo1 = rad(lon);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: deg(la2), lon: ((deg(lo2) + 540) % 360) - 180 };
}

/** Initial bearing from a to b, 0-360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const DIRS: Compass[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass8(bearing: number): Compass {
  return DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/** Metres east/north of `origin` for a nearby point (equirectangular; fine within ~1 km). */
export function offsetM(origin: LatLon, dxEastM: number, dyNorthM: number): LatLon {
  return {
    lat: origin.lat + dyNorthM / 111320,
    lon: origin.lon + dxEastM / (111320 * Math.cos(rad(origin.lat))),
  };
}

const TILE = 256;
/** Slippy-map tile and in-tile pixel (0-256, fractional) for a lon/lat at zoom z. */
export function lonLatToTilePixel(lon: number, lat: number, z: number): { tx: number; ty: number; px: number; py: number } {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin(rad(Math.max(-85.0511, Math.min(85.0511, lat))));
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return { tx, ty, px: (x - tx) * TILE, py: (y - ty) * TILE };
}

/** EPSG:4326 → EPSG:3857 metres. */
export function lonLatTo3857(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * 6378137;
  return [x, y];
}
