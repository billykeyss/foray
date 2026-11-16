"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { WaterSummary } from "@/lib/fishing/types.ts";
import MapControls, { type BurnsState } from "./map-controls.tsx";
import { getCurrentGps } from "@/lib/geo.ts";
import { classifyBurn } from "@/lib/burn-window.ts";
import { buildStyle, type BaseId } from "./styles.ts";
import { keepTerrain, TILT_PITCH } from "./terrain.ts";
import {
  addBurns,
  addFieldLayers,
  classifyBurns,
  BURNS_FILL,
  BURNS_URL,
  OVERLAY_LAYERS,
  type BurnCollection,
  setLine,
  spotFeatures,
  SPOTS_LAYER,
  SAVED_LAYER,
  SAVED_SRC,
  savedFeatures,
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
  /** User-saved spots, drawn as rust diamonds. */
  savedSpots?: ForageSpot[];
  onSavedSpotTap?: (id: string) => void;
  waters: WaterSummary[];
  spotlightLine: [number, number][] | null;
  onWaterTap: (slug: string) => void;
  onSpotTap: (id: string) => void;
  onLongPress: (lon: number, lat: number) => void;
  /** A GPS fix from the map's locate button (the map has already panned to it). */
  onLocate?: (lon: number, lat: number) => void;
  /** Screen insets (px) covered by UI over the map, e.g. the trip card; the camera centres in what's left. */
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
}

// Burn perimeters are ~2.7 MB: fetched only when the layer is first switched on, then kept for the
// session (and runtime-cached by the service worker for offline, see sw/index.ts "foray-data").
let burnsCache: BurnCollection | null = null;
async function loadBurns(): Promise<BurnCollection> {
  if (burnsCache) return burnsCache;
  const res = await fetch(BURNS_URL);
  if (!res.ok) throw new Error(`burns.geojson HTTP ${res.status}`);
  burnsCache = classifyBurns((await res.json()) as BurnCollection);
  return burnsCache;
}

/** GeolocationPositionError codes → what the user sees. */
function gpsMessage(err: unknown): string {
  const code = (err as { code?: number } | null)?.code;
  if (code === 1) return "Location permission denied — allow location for this site to use GPS.";
  if (code === 3) return "Couldn’t get a GPS fix in time — try again with a clearer view of the sky.";
  if (code === 2) return "Your location is unavailable right now.";
  return "Location isn’t available on this device.";
}

function burnPopup(p: Record<string, unknown>): HTMLElement {
  const c = classifyBurn(Number(p.year), new Date());
  const since =
    c.springsSince <= 0 ? "burned this year" : `${c.springsSince} spring${c.springsSince === 1 ? "" : "s"} since burn`;
  const acres = p.acres ? `${Number(p.acres).toLocaleString("en-US")} ac` : "—";
  const root = document.createElement("div");
  root.className = "kp-burn-pop";
  const name = document.createElement("div");
  name.className = "kp-burn-pop-name";
  name.textContent = String(p.name || "Unnamed fire");
  const meta = document.createElement("div");
  meta.className = "kp-burn-pop-meta";
  meta.textContent = `${p.year ?? "?"} · ${acres} · ${since}`;
  const hint = document.createElement("div");
  hint.className = "kp-burn-pop-hint";
  hint.dataset.window = c.window;
  hint.textContent = c.label;
  root.append(name, meta, hint);
  return root;
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
  const [burns, setBurns] = useState<BurnsState>(burnsCache ? { kind: "ready", count: burnsCache.features.length } : { kind: "idle" });
  const [locating, setLocating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const baseRef = useRef(base);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;

  useEffect(() => setBase(props.base), [props.base]);
  useEffect(() => setOverlays(props.overlays), [props.overlays.forest, props.overlays.blm, props.overlays.burns, props.overlays.vegetation, props.overlays.hydro]); // eslint-disable-line react-hooks/exhaustive-deps

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
      addFieldLayers(map, {
        overlays: overlaysRef.current,
        waters: p.waters,
        spots: p.forageSpots,
        saved: p.savedSpots,
        line: p.spotlightLine,
        burns: burnsCache,
      });
    };
    map.on("style.load", onStyle);

    const pick = (layers: string[], pt: maplibregl.PointLike) =>
      map.queryRenderedFeatures(pt, { layers: layers.filter((l) => map.getLayer(l)) })[0];
    map.on("click", (e) => {
      const w = pick([WATER_PINS], e.point);
      if (w) return latest.current.onWaterTap(w.properties?.slug);
      const sv = pick([SAVED_LAYER], e.point);
      if (sv) return latest.current.onSavedSpotTap?.(sv.properties?.id);
      const s = pick([SPOTS_LAYER], e.point);
      if (s) return latest.current.onSpotTap(s.properties?.id);
      const b = overlaysRef.current.burns ? pick([BURNS_FILL], e.point) : undefined;
      if (b) {
        new maplibregl.Popup({ closeButton: true, maxWidth: "240px", className: "kp-burn-popup" })
          .setLngLat(e.lngLat)
          .setDOMContent(burnPopup(b.properties ?? {}))
          .addTo(map);
        return;
      }
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
    for (const l of [WATER_PINS, SAVED_LAYER, SPOTS_LAYER, WATER_CLUSTERS]) {
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
    for (const key of Object.keys(OVERLAY_LAYERS) as (keyof Overlays)[]) {
      for (const id of OVERLAY_LAYERS[key]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", overlays[key] ? "visible" : "none");
      }
    }
  }, [overlays]);

  // Burns: lazy-load the perimeters on first switch-on, then add them to the live style.
  useEffect(() => {
    if (!overlays.burns) return;
    let cancelled = false;
    const add = (data: BurnCollection) => {
      const map = mapRef.current;
      if (!map || cancelled) return;
      setBurns({ kind: "ready", count: data.features.length });
      // isStyleLoaded() is false while tiles stream in, so just try: addSource only throws before the
      // style JSON itself has loaded, and then the style.load handler adds them from burnsCache.
      try {
        addBurns(map, data, overlaysRef.current.burns);
      } catch {
        /* added on style.load */
      }
    };
    if (burnsCache) add(burnsCache);
    else {
      setBurns({ kind: "loading" });
      loadBurns().then(add, (e) => {
        console.warn("burn layer load failed", e);
        if (!cancelled) setBurns({ kind: "error" });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [overlays.burns]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource(SPOTS_SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData(spotFeatures(props.forageSpots));
  }, [props.forageSpots]);

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource(SAVED_SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData(savedFeatures(props.savedSpots ?? []));
  }, [props.savedSpots]);

  const pad = props.padding;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setPadding({ top: pad?.top ?? 0, bottom: pad?.bottom ?? 0, left: pad?.left ?? 0, right: pad?.right ?? 0 });
    };
    // setPadding is a jumpTo, which would cancel a camera move in flight (e.g. the ease to a new
    // location when the trip card resizes for it); apply it once the move ends instead.
    if (!map.isMoving()) {
      apply();
      return;
    }
    map.once("moveend", apply);
    return () => {
      map.off("moveend", apply);
    };
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const locate = () => {
    if (locating) return;
    setLocating(true);
    setToast(null);
    getCurrentGps()
      .then(({ lat, lon }) => {
        mapRef.current?.easeTo({ center: [lon, lat], zoom: 12 });
        latest.current.onLocate?.(lon, lat);
      })
      .catch((err) => setToast(gpsMessage(err)))
      .finally(() => setLocating(false));
  };

  return (
    <div className="field-map absolute inset-0" data-testid="field-map">
      <style>{`
        /* Scoped selectors: must out-rank maplibre-gl.css, which can load after this tag. */
        .field-map .maplibregl-ctrl-top-left{top:calc(116px + env(safe-area-inset-top))}
        /* Phone: keep attribution above the trip card's peek (--kp-trip-peek, see .kp-trip). */
        .field-map .maplibregl-ctrl-bottom-left{bottom:calc(var(--kp-trip-peek, 46dvh) + 6px)}
        .field-map .kp-map-toast{position:absolute;left:50%;transform:translateX(-50%);top:calc(116px + env(safe-area-inset-top));z-index:6;
          display:flex;align-items:center;gap:8px;max-width:min(360px,calc(100% - 140px));padding:8px 6px 8px 12px;border-radius:12px;
          background:var(--kp-ink);color:var(--kp-bone);font:500 12.5px/1.35 var(--kp-font-body,system-ui);box-shadow:var(--kp-shadow-chip)}
        .field-map .kp-map-toast button{flex:none;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:inherit;font-size:18px;cursor:pointer}
        .field-map .kp-burn-popup .maplibregl-popup-content{padding:10px 26px 10px 12px;border-radius:10px;background:var(--kp-bone);color:var(--kp-ink)}
        .field-map .kp-burn-pop{font:500 11px/1.55 var(--kp-font-mono,ui-monospace,monospace)}
        .field-map .kp-burn-pop-name{font:500 16px/1.2 var(--kp-font-display,Georgia,serif)}
        .field-map .kp-burn-pop-meta{opacity:.7;letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
        .field-map .kp-burn-pop-hint{margin-top:6px}
        .field-map .kp-burn-pop-hint[data-window="prime"]{color:var(--kp-amber-ink);font-weight:600}
        @media (min-width:1024px){
          .field-map .kp-map-toast{top:12px}
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
        locating={locating}
        burns={burns}
      />
      {toast && (
        <div className="kp kp-map-toast" role="alert">
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}
