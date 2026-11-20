/** Tree cover at a point: LANDFIRE 2023 EVT via WMS GetFeatureInfo + the generated code table. */
import { EVT_NAMES } from "./evt-names.ts";
import { lonLatTo3857 } from "./geo.ts";

export const LANDFIRE_WMS = "https://edcintl.cr.usgs.gov/geoserver/landfire/wms";
const LAYER = "LF2023_EVT_CONUS";

export interface EvtInfo {
  code: number;
  name: string;
  lifeform: string;
  physiognomy: string;
  group: string;
  coverType: string;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

/** A 1×1-pixel GetFeatureInfo over a 100 m box centred on the point (EPSG:3857). */
export function evtFeatureInfoUrl(lat: number, lon: number): string {
  const [x, y] = lonLatTo3857(lon, lat);
  const q = new URLSearchParams({
    service: "WMS",
    request: "GetFeatureInfo",
    version: "1.3.0",
    layers: LAYER,
    query_layers: LAYER,
    styles: "",
    crs: "EPSG:3857",
    bbox: [x - 50, y - 50, x + 50, y + 50].map((v) => v.toFixed(1)).join(","),
    width: "1",
    height: "1",
    i: "0",
    j: "0",
    info_format: "application/json",
  });
  return `${LANDFIRE_WMS}?${q}`;
}

export function parseEvtResponse(json: unknown): number | null {
  const f = (json as { features?: { properties?: { GRAY_INDEX?: unknown } }[] })?.features?.[0];
  const v = Number(f?.properties?.GRAY_INDEX);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function describeEvt(code: number | null): EvtInfo | null {
  if (code == null || code <= 0) return null;
  const row = EVT_NAMES[code];
  if (!row) return { code, name: `Vegetation type ${code}`, lifeform: "", physiognomy: "", group: "", coverType: "" };
  const [name, lifeform, physiognomy, group, coverType] = row;
  return { code, name, lifeform, physiognomy, group, coverType };
}

/** Fetch and describe the EVT at a point. Throws on HTTP/network failure; null when no data there. */
export async function fetchEvt(lat: number, lon: number, fetchImpl: FetchLike, signal?: AbortSignal): Promise<EvtInfo | null> {
  const res = await fetchImpl(evtFeatureInfoUrl(lat, lon), { signal });
  if (!res.ok) throw new Error(`LANDFIRE HTTP ${res.status ?? "error"}`);
  return describeEvt(parseEvtResponse(await res.json()));
}

/** Short tree-cover label for a reason chip: the cover type when it names trees, else the group. */
export function evtShortName(e: EvtInfo): string {
  const pick = e.coverType && !/^(Introduced|Developed|Agricultur|Sparse|Barren|Open Water)/.test(e.coverType) ? e.coverType : e.group || e.name;
  return pick.replace(/\s+Forest and Woodland$/, "").replace(/\s+Forest$/, "");
}
