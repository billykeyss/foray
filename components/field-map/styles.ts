import type { StyleSpecification } from "maplibre-gl";

export type BaseId = "satellite" | "topo";

const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const USGS =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}";

export function buildStyle(base: BaseId): StyleSpecification {
  const satellite = base === "satellite";
  return {
    version: 8,
    glyphs: "/fonts/glyphs/{fontstack}/{range}.pbf",
    sources: {
      base: {
        type: "raster",
        tiles: [satellite ? ESRI : USGS],
        tileSize: 256,
        maxzoom: satellite ? 19 : 16,
        attribution: satellite
          ? "Imagery &copy; Esri, Maxar, Earthstar Geographics"
          : "USGS The National Map",
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}
