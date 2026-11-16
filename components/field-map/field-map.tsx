"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { WaterSummary } from "@/lib/fishing/types.ts";
import MapControls from "./map-controls.tsx";
import { buildStyle, type BaseId } from "./styles.ts";
import { keepTerrain, TILT_PITCH } from "./terrain.ts";
import {
  addFieldLayers,
  setLine,
  spotFeatures,
  BLM,
  FOREST,
  SPOTS_LAYER,
  SPOTS_SRC,
  WATER_CLUSTERS,
  WATER_PINS,
  WATERS_SRC,
  type ForageSpot,
  type Overlays,
} from "./layers.ts";

export interface FieldMapProps {
  center: [number, number];
  base: BaseId;
  overlays: Overlays;
  forageSpots: ForageSpot[];
  waters: WaterSummary[];
  spotlightLine: [number, number][] | null;
  onWaterTap: (slug: string) => void;
  onSpotTap: (id: string) => void;
  onLongPress: (lon: number, lat: number) => void;
  /** Screen insets (px) covered by UI over the map, e.g. the trip card; the camera centres in what's left. */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
}

export default function FieldMap(props: FieldMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  // Controls are shown here so the map works standalone; base/overlays are seeded from props.
  const [base, setBase] = useState<BaseId>(props.base);
  const [overlays, setOverlays] = useState<Overlays>(props.overlays);
  const [tilted, setTilted] = useState(false);
  const baseRef = useRef(base);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;

  useEffect(() => setBase(props.base), [props.base]);
  useEffect(() => setOverlays(props.overlays), [props.overlays.forest, props.overlays.blm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: buildStyle(baseRef.current),
      center: latest.current.center,
      zoom: 9,
      maxPitch: 70,
      attributionControl: false,
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __fieldMap?: MLMap }).__fieldMap = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), "top-left");
    const offTerrain = keepTerrain(map, { exaggeration: 1.3 });
    const onStyle = () => {
      const p = latest.current;
      addFieldLayers(map, { overlays: overlaysRef.current, waters: p.waters, spots: p.forageSpots, line: p.spotlightLine });
    };
    map.on("style.load", onStyle);

    const pick = (layers: string[], pt: maplibregl.PointLike) =>
      map.queryRenderedFeatures(pt, { layers: layers.filter((l) => map.getLayer(l)) })[0];
    map.on("click", (e) => {
      const w = pick([WATER_PINS], e.point);
      if (w) return latest.current.onWaterTap(w.properties?.slug);
      const s = pick([SPOTS_LAYER], e.point);
      if (s) return latest.current.onSpotTap(s.properties?.id);
      const c = pick([WATER_CLUSTERS], e.point);
      if (c) {
        const src = map.getSource(WATERS_SRC) as maplibregl.GeoJSONSource;
        src
          .getClusterExpansionZoom(c.properties?.cluster_id)
          .then((zoom) =>
            map.easeTo({ center: (c.geometry as GeoJSON.Point).coordinates as [number, number], zoom }),
          );
      }
    });
    for (const l of [WATER_PINS, SPOTS_LAYER, WATER_CLUSTERS]) {
      map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
    }

    // Long press (~500ms without moving) and desktop right-click.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => clearTimeout(timer);
    const start = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if ("touches" in e.originalEvent && e.originalEvent.touches.length > 1) return cancel();
      cancel();
      timer = setTimeout(() => latest.current.onLongPress(e.lngLat.lng, e.lngLat.lat), 500);
    };
    map.on("touchstart", start);
    map.on("touchend", cancel);
    map.on("touchmove", cancel);
    map.on("touchcancel", cancel);
    map.on("dragstart", cancel);
    map.on("zoomstart", cancel);
    map.on("pitchstart", cancel);
    map.on("contextmenu", (e) => {
      cancel();
      latest.current.onLongPress(e.lngLat.lng, e.lngLat.lat);
    });

    return () => {
      cancel();
      offTerrain();
      map.off("style.load", onStyle);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Base switch: setStyle wipes sources, so style.load handlers re-add terrain and overlays.
  const appliedBase = useRef<BaseId>(props.base);
  useEffect(() => {
    baseRef.current = base;
    if (appliedBase.current === base) return;
    appliedBase.current = base;
    mapRef.current?.setStyle(buildStyle(base), { diff: false });
  }, [base]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || (!tilted && map.getPitch() === 0)) return;
    map.easeTo({ pitch: tilted ? TILT_PITCH : 0, duration: 600 });
  }, [tilted]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, on] of [[FOREST, overlays.forest], [BLM, overlays.blm]] as const) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    }
  }, [overlays]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource(SPOTS_SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData(spotFeatures(props.forageSpots));
  }, [props.forageSpots]);

  const pad = props.padding;
  useEffect(() => {
    mapRef.current?.setPadding({ top: pad?.top ?? 0, bottom: pad?.bottom ?? 0, left: pad?.left ?? 0, right: pad?.right ?? 0 });
  }, [pad?.top, pad?.bottom, pad?.left, pad?.right]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const line = props.spotlightLine;
    setLine(map, line);
    // Bring the highlighted reach into view (within the padded, uncovered part of the map).
    if (line && line.length > 1) {
      const b = new maplibregl.LngLatBounds(line[0], line[0]);
      for (const pt of line) b.extend(pt);
      map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 600 });
    }
  }, [props.spotlightLine]);

  useEffect(() => {
    const map = mapRef.current;
    const c = map?.getCenter();
    if (!map || (c && c.lng === props.center[0] && c.lat === props.center[1])) return;
    map.easeTo({ center: props.center, duration: 500 });
  }, [props.center[0], props.center[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((p) =>
      mapRef.current?.easeTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 12 }),
    );
  };

  return (
    <div className="field-map absolute inset-0" data-testid="field-map">
      <style>{`
        /* Scoped selectors: must out-rank maplibre-gl.css, which can load after this tag. */
        .field-map .maplibregl-ctrl-top-left{top:calc(116px + env(safe-area-inset-top))}
        /* Phone: keep attribution above the trip card's peek (46dvh, see .kp-trip). */
        .field-map .maplibregl-ctrl-bottom-left{bottom:calc(46dvh + 6px)}
        @media (min-width:1024px){
          .field-map .maplibregl-ctrl-top-left{top:12px}
          .field-map .maplibregl-ctrl-bottom-left{bottom:0}
        }
      `}</style>
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      <MapControls
        base={base}
        onBase={setBase}
        tilted={tilted}
        onTilt={setTilted}
        overlays={overlays}
        onOverlays={setOverlays}
        onLocate={locate}
      />
    </div>
  );
}
