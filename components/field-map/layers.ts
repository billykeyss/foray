import type { Map, GeoJSONSource } from "maplibre-gl";
import type { WaterSummary } from "@/lib/fishing/types.ts";

export const FOREST = "forest";
export const BLM = "blm";
export const WATERS_SRC = "waters";
export const WATER_CLUSTERS = "water-clusters";
export const WATER_COUNT = "water-cluster-count";
export const WATER_PINS = "water-pins";
export const SPOTS_SRC = "spots";
export const SPOTS_LAYER = "spots-circles";
export const LINE_SRC = "spotlight";
export const LINE_LAYER = "spotlight-line";
const SQUARE = "water-square";

const FOREST_TILES =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ProclaimedForestsAndGrasslands_01/MapServer/export" +
  "?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image&layers=show:3,0";
const BLM_TILES =
  "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_BLM_Only/MapServer/tile/{z}/{y}/{x}";

export interface Overlays {
  forest: boolean;
  blm: boolean;
}
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
  s: { overlays: Overlays; waters: WaterSummary[]; spots: ForageSpot[]; line: [number, number][] | null },
) {
  addSquare(map);
  const vis = (on: boolean) => ({ visibility: on ? "visible" : "none" }) as const;
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
}

export function setLine(map: Map, line: [number, number][] | null) {
  const src = map.getSource(LINE_SRC) as GeoJSONSource | undefined;
  src?.setData(
    line && line.length > 1
      ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }
      : (empty as never),
  );
}
