import type { Map, GeoJSONSource } from "maplibre-gl";
import type { WaterSummary } from "@/lib/fishing/types.ts";
import { classifyBurn } from "@/lib/burn-window.ts";

export const FOREST = "forest";
export const BLM = "blm";
/** LANDFIRE "Forest type" (existing vegetation) WMS overlay. */
export const VEG = "vegetation";
/** USGS National Hydrography ("Water") overlay. */
export const HYDRO = "hydro";
/** Wildfire perimeters (NIFC, public/data/burns.geojson), classified by morel window. */
export const BURNS_SRC = "burns";
export const BURNS_FILL = "burns-fill";
export const BURNS_LINE = "burns-line";
export const BURNS_URL = "/data/burns.geojson";
export const WATERS_SRC = "waters";
export const WATER_CLUSTERS = "water-clusters";
export const WATER_COUNT = "water-cluster-count";
export const WATER_PINS = "water-pins";
export const SPOTS_SRC = "spots";
export const SPOTS_LAYER = "spots-circles";
export const SAVED_SRC = "saved-spots";
export const SAVED_LAYER = "saved-spots-pins";
const DIAMOND = "saved-diamond";
export const LINE_SRC = "spotlight";
export const LINE_LAYER = "spotlight-line";
const SQUARE = "water-square";
/** Forage Finder: numbered amber result pins and the faint search-radius circle. */
export const FIND_SRC = "find-pins";
export const FIND_LAYER = "find-pins-circle";
export const FIND_LABEL = "find-pins-label";
export const FIND_RADIUS_SRC = "find-radius";
const FIND_RADIUS_FILL = "find-radius-fill";
const FIND_RADIUS_LINE = "find-radius-line";

const FOREST_TILES =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ProclaimedForestsAndGrasslands_01/MapServer/export" +
  "?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image&layers=show:3,0";
const BLM_TILES =
  "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_BLM_Only/MapServer/tile/{z}/{y}/{x}";

// LANDFIRE Existing Vegetation Type (2023, CONUS): a public, CORS-enabled WMS (same service and
// layer the Leaflet map used). The layer name is case-sensitive; the lowercase alias is a group.
const VEG_TILES =
  "https://edcintl.cr.usgs.gov/geoserver/landfire/wms?service=WMS&request=GetMap&version=1.3.0" +
  "&layers=LF2023_EVT_CONUS&styles=&format=image/png&transparent=true&width=256&height=256" +
  "&crs=EPSG:3857&bbox={bbox-epsg-3857}";
const HYDRO_TILES =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}";

export interface Overlays {
  /** National Forest land (USFS). */
  forest: boolean;
  blm: boolean;
  /** Wildfire burn perimeters (morel intel). */
  burns: boolean;
  /** LANDFIRE forest / vegetation type. */
  vegetation: boolean;
  /** USGS hydrography: creeks, ponds, springs. */
  hydro: boolean;
}

export const NO_OVERLAYS: Overlays = { forest: false, blm: false, burns: false, vegetation: false, hydro: false };

/** Overlay layer ids by toggle (burns has two layers). */
export const OVERLAY_LAYERS: Record<keyof Overlays, string[]> = {
  forest: [FOREST],
  blm: [BLM],
  burns: [BURNS_FILL, BURNS_LINE],
  vegetation: [VEG],
  hydro: [HYDRO],
};
export interface ForageSpot {
  id: string;
  lon: number;
  lat: number;
  label: string;
}

const empty = { type: "FeatureCollection", features: [] } as const;

export function waterFeatures(waters: WaterSummary[]) {
  return {
    type: "FeatureCollection" as const,
    features: waters.map((w) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [w.lon, w.lat] },
      properties: { slug: w.slug, name: w.name },
    })),
  };
}

export function spotFeatures(spots: ForageSpot[]) {
  return {
    type: "FeatureCollection" as const,
    features: spots.map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
      properties: { id: s.id, label: s.label },
    })),
  };
}

export interface FindPin {
  rank: number;
  lon: number;
  lat: number;
}
export interface FindCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

export function findFeatures(pins: FindPin[], selected: number | null) {
  return {
    type: "FeatureCollection" as const,
    features: pins.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      properties: { rank: p.rank, label: String(p.rank), selected: p.rank === selected ? 1 : 0 },
    })),
  };
}

/** A 64-gon approximating a geodesic circle (good enough for a faint radius hint). */
export function circleFeature(c: FindCircle | null) {
  if (!c) return empty;
  const pts: [number, number][] = [];
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((c.lat * Math.PI) / 180);
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([c.lon + (Math.sin(a) * c.radiusKm) / kmPerDegLon, c.lat + (Math.cos(a) * c.radiusKm) / kmPerDegLat]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

export function savedFeatures(spots: ForageSpot[]) {
  return spotFeatures(spots);
}

/** Saved spots: a rust diamond with a cream ring, distinct from amber forage circles and blue water squares. */
function addDiamond(map: Map) {
  if (map.hasImage(DIAMOND)) return;
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return;
  const path = (r: number) => {
    g.beginPath();
    g.moveTo(size / 2, size / 2 - r);
    g.lineTo(size / 2 + r, size / 2);
    g.lineTo(size / 2, size / 2 + r);
    g.lineTo(size / 2 - r, size / 2);
    g.closePath();
  };
  g.fillStyle = "#f3efe4";
  path(14);
  g.fill();
  g.fillStyle = "#a14a2a";
  path(10);
  g.fill();
  g.fillStyle = "#f3efe4";
  g.beginPath();
  g.arc(size / 2, size / 2, 2.6, 0, Math.PI * 2);
  g.fill();
  map.addImage(DIAMOND, g.getImageData(0, 0, size, size));
}

function addSquare(map: Map) {
  if (map.hasImage(SQUARE)) return;
  const size = 24;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return;
  g.fillStyle = "#f3efe4";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#2f5d78";
  g.fillRect(3, 3, size - 6, size - 6);
  map.addImage(SQUARE, g.getImageData(0, 0, size, size));
}

/** Adds every overlay/pin source+layer. Call on each style.load (a new style wipes them). */
export function addFieldLayers(
  map: Map,
  s: {
    overlays: Overlays;
    waters: WaterSummary[];
    spots: ForageSpot[];
    saved?: ForageSpot[];
    line: [number, number][] | null;
    findPins?: FindPin[];
    findSelected?: number | null;
    findCircle?: FindCircle | null;
    /** Burn perimeters, once loaded (they're fetched lazily on first toggle). */
    burns?: BurnCollection | null;
  },
) {
  addSquare(map);
  addDiamond(map);
  const vis = (on: boolean) => ({ visibility: on ? "visible" : "none" }) as const;
  // Order, bottom to top: base < hillshade < forest type < NF < BLM < burns < water < pins.
  if (!map.getSource(VEG)) {
    map.addSource(VEG, {
      type: "raster",
      tiles: [VEG_TILES],
      tileSize: 256,
      minzoom: 4,
      maxzoom: 15,
      attribution: "Vegetation: LANDFIRE 2023 EVT · USGS",
    });
    map.addLayer({ id: VEG, type: "raster", source: VEG, layout: vis(s.overlays.vegetation), paint: { "raster-opacity": 0.5 } });
  }
  if (!map.getSource(FOREST)) {
    map.addSource(FOREST, {
      type: "raster",
      tiles: [FOREST_TILES],
      tileSize: 256,
      minzoom: 6,
      maxzoom: 13,
      attribution: "USDA Forest Service",
    });
    map.addLayer({
      id: FOREST,
      type: "raster",
      source: FOREST,
      layout: vis(s.overlays.forest),
      paint: { "raster-opacity": 0.62 },
    });
  }
  if (!map.getSource(BLM)) {
    map.addSource(BLM, {
      type: "raster",
      tiles: [BLM_TILES],
      tileSize: 256,
      maxzoom: 14,
      attribution: "Bureau of Land Management",
    });
    map.addLayer({
      id: BLM,
      type: "raster",
      source: BLM,
      layout: vis(s.overlays.blm),
      paint: { "raster-opacity": 0.55 },
    });
  }
  if (s.burns) addBurns(map, s.burns, s.overlays.burns);
  if (!map.getSource(HYDRO)) {
    map.addSource(HYDRO, {
      type: "raster",
      tiles: [HYDRO_TILES],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Water: USGS National Hydrography",
    });
    map.addLayer({ id: HYDRO, type: "raster", source: HYDRO, layout: vis(s.overlays.hydro) });
  }
  if (!map.getSource(LINE_SRC)) {
    map.addSource(LINE_SRC, { type: "geojson", data: empty as never });
    map.addLayer({
      id: LINE_LAYER,
      type: "line",
      source: LINE_SRC,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#e0a043", "line-width": 5 },
    });
  }
  setLine(map, s.line);
  if (!map.getSource(FIND_RADIUS_SRC)) {
    map.addSource(FIND_RADIUS_SRC, { type: "geojson", data: circleFeature(s.findCircle ?? null) as never });
    map.addLayer({ id: FIND_RADIUS_FILL, type: "fill", source: FIND_RADIUS_SRC, paint: { "fill-color": "#e0a043", "fill-opacity": 0.06 } });
    map.addLayer({
      id: FIND_RADIUS_LINE,
      type: "line",
      source: FIND_RADIUS_SRC,
      paint: { "line-color": "#e0a043", "line-width": 1.5, "line-opacity": 0.7, "line-dasharray": [2, 2] },
    });
  }
  if (!map.getSource(WATERS_SRC)) {
    map.addSource(WATERS_SRC, {
      type: "geojson",
      data: waterFeatures(s.waters),
      cluster: true,
      clusterMaxZoom: 8,
      clusterRadius: 48,
    });
    map.addLayer({
      id: WATER_CLUSTERS,
      type: "circle",
      source: WATERS_SRC,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#2f5d78",
        "circle-radius": ["step", ["get", "point_count"], 16, 25, 20, 100, 26],
        "circle-stroke-color": "#f3efe4",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: WATER_COUNT,
      type: "symbol",
      source: WATERS_SRC,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
        "text-font": ["Open Sans Semibold"],
      } as never,
      paint: { "text-color": "#f3efe4" },
    });
    map.addLayer({
      id: WATER_PINS,
      type: "symbol",
      source: WATERS_SRC,
      filter: ["!", ["has", "point_count"]],
      layout: { "icon-image": SQUARE, "icon-size": 0.8, "icon-allow-overlap": true },
    });
  }
  if (!map.getSource(SPOTS_SRC)) {
    map.addSource(SPOTS_SRC, { type: "geojson", data: spotFeatures(s.spots) });
    map.addLayer({
      id: SPOTS_LAYER,
      type: "circle",
      source: SPOTS_SRC,
      paint: {
        "circle-color": "#e0a043",
        "circle-radius": 8,
        "circle-stroke-color": "#1a2b22",
        "circle-stroke-width": 2,
      },
    });
  }
  if (!map.getSource(SAVED_SRC)) {
    map.addSource(SAVED_SRC, { type: "geojson", data: savedFeatures(s.saved ?? []) });
    map.addLayer({
      id: SAVED_LAYER,
      type: "symbol",
      source: SAVED_SRC,
      layout: { "icon-image": DIAMOND, "icon-size": 0.9, "icon-allow-overlap": true },
    });
  }
  if (!map.getSource(FIND_SRC)) {
    map.addSource(FIND_SRC, { type: "geojson", data: findFeatures(s.findPins ?? [], s.findSelected ?? null) });
    map.addLayer({
      id: FIND_LAYER,
      type: "circle",
      source: FIND_SRC,
      paint: {
        "circle-color": "#e0a043",
        "circle-radius": ["case", ["==", ["get", "selected"], 1], 15, 12],
        "circle-stroke-color": ["case", ["==", ["get", "selected"], 1], "#1a2b22", "#f3efe4"],
        "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 3, 2],
      },
    });
    map.addLayer({
      id: FIND_LABEL,
      type: "symbol",
      source: FIND_SRC,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 13,
        "text-font": ["Open Sans Semibold"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      } as never,
      paint: { "text-color": "#1a2b22" },
    });
  }
}

export function setFind(map: Map, pins: FindPin[], selected: number | null, circle: FindCircle | null) {
  (map.getSource(FIND_SRC) as GeoJSONSource | undefined)?.setData(findFeatures(pins, selected));
  (map.getSource(FIND_RADIUS_SRC) as GeoJSONSource | undefined)?.setData(circleFeature(circle) as never);
}

export function setLine(map: Map, line: [number, number][] | null) {
  const src = map.getSource(LINE_SRC) as GeoJSONSource | undefined;
  src?.setData(
    line && line.length > 1
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }
      : (empty as never),
  );
}

export type BurnCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

/** Bake each perimeter's morel-window colour/opacity into its properties (current-year relative). */
export function classifyBurns(fc: BurnCollection, now: Date = new Date()): BurnCollection {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const c = classifyBurn(Number(f.properties?.year), now);
      return { ...f, properties: { ...f.properties, _color: c.color, _opacity: c.fillOpacity } };
    }),
  };
}

/** Add the burn perimeters below the water overlay and pins. Idempotent; call again after style.load. */
export function addBurns(map: Map, data: BurnCollection, visible: boolean) {
  if (map.getSource(BURNS_SRC)) return;
  const before = [HYDRO, LINE_LAYER].find((id) => map.getLayer(id));
  const layout = { visibility: visible ? "visible" : "none" } as const;
  map.addSource(BURNS_SRC, { type: "geojson", data, attribution: "Fire perimeters: NIFC" });
  map.addLayer(
    { id: BURNS_FILL, type: "fill", source: BURNS_SRC, layout, paint: { "fill-color": ["get", "_color"], "fill-opacity": ["get", "_opacity"] } },
    before,
  );
  map.addLayer(
    { id: BURNS_LINE, type: "line", source: BURNS_SRC, layout, paint: { "line-color": ["get", "_color"], "line-width": 1 } },
    before,
  );
}
