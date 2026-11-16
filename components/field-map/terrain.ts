import type { Map } from "maplibre-gl";

export const TILT_PITCH = 60;
export const TERRAIN_SOURCE = "foray-dem";
export const SHADE_SOURCE = "foray-dem-shade";
export const HILLSHADE_LAYER = "foray-hillshade";
const DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];
const DEM_ATTR = "Terrain: Mapzen / AWS Terrain Tiles";

function dem() {
  return {
    type: "raster-dem" as const,
    tiles: DEM_TILES,
    tileSize: 256,
    maxzoom: 15,
    encoding: "terrarium" as const,
    attribution: DEM_ATTR,
  };
}

function apply(map: Map, exaggeration: number) {
  if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, dem());
  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration });
  if (!map.getSource(SHADE_SOURCE)) map.addSource(SHADE_SOURCE, dem());
  if (!map.getLayer(HILLSHADE_LAYER)) {
    map.addLayer(
      {
        id: HILLSHADE_LAYER,
        type: "hillshade",
        source: SHADE_SOURCE,
        paint: { "hillshade-exaggeration": 0.35 },
      },
      // Below overlays/pins when they exist, directly above the base otherwise.
      map.getLayer("forest") ? "forest" : undefined,
    );
  }
}

/** Re-adds DEM, terrain and hillshade now and on every style.load. Returns unsubscribe. */
export function keepTerrain(map: Map, opts: { exaggeration?: number } = {}): () => void {
  const exaggeration = opts.exaggeration ?? 1.3;
  const run = () => apply(map, exaggeration);
  map.on("style.load", run);
  if (map.isStyleLoaded()) run();
  return () => {
    map.off("style.load", run);
  };
}
