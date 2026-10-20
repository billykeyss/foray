"use client";

import { useEffect, useRef, useState } from "react";
import { classifyBurn } from "@/lib/burn-window";

interface Props {
  lat: number | null;
  lon: number | null;
  onSelect: (lat: number, lon: number) => void;
}

declare global {
  interface Window {
    L: any;
  }
}

const PIN_HTML = `
<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
  <div style="
    position:absolute;width:48px;height:48px;border-radius:50%;
    border:1px solid rgba(189,122,18,0.45);top:-13px;left:-13px;
    animation:mp 2.4s ease-out infinite;"></div>
  <div style="
    width:22px;height:22px;border-radius:50%;
    background:#bd7a12;
    box-shadow:
      0 0 0 3px rgba(250,245,233,0.9),
      0 0 0 8px rgba(189,122,18,0.25),
      0 6px 14px -3px rgba(44,38,32,0.5);"></div>
</div>
<style>
@keyframes mp {
  0%   { transform: scale(0.7); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}
</style>
`;

// LANDFIRE Existing Vegetation Type (2023, CONUS) — a public, CORS-enabled WMS.
// Online-only intel (like the burn layer); the service worker caches viewed
// tiles for partial offline. CONUS-only, so it won't cover BC. Note the layer
// name is the exact (case-sensitive) published name; the lowercase alias in the
// capabilities is a non-renderable group.
const FOREST_WMS = "https://edcintl.cr.usgs.gov/geoserver/landfire/wms";
const FOREST_LAYER = "LF2023_EVT_CONUS";

// Basemaps — all keyless. The default is about water: Esri's quiet light-gray
// canvas with the USGS National Hydrography layer (creeks, ponds, springs,
// marshes, with names) drawn on top, so water is the only colour on the map.
// (Carto's light_nolabels started serving "API KEY REQUIRED" placeholder
// tiles in Oct 2026.) USGS caches stop at z16 and Esri's canvas at z16;
// Leaflet upscales beyond that. USGS layers are US-only.
type BasemapId = "water" | "topo" | "satellite";
const BASEMAP_KEY = "foray.basemap.v1";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const USGS = "https://basemap.nationalmap.gov/arcgis/rest/services";
const USGS_HYDRO = `${USGS}/USGSHydroCached/MapServer/tile/{z}/{y}/{x}`;
const BASEMAPS: Record<BasemapId, { label: string; base: { url: string; attribution: string; maxNativeZoom: number }; hydro: boolean }> = {
  water: {
    label: "Water",
    base: {
      url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
      attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
      maxNativeZoom: 16,
    },
    hydro: true,
  },
  topo: {
    label: "Topo",
    base: {
      url: `${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}`,
      attribution: "USGS The National Map",
      maxNativeZoom: 16,
    },
    hydro: false, // already drawn into USGS Topo
  },
  satellite: {
    label: "Sat",
    base: {
      url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      maxNativeZoom: 19,
    },
    hydro: true,
  },
};

function readBasemap(): BasemapId {
  try {
    const v = localStorage.getItem(BASEMAP_KEY);
    if (v === "water" || v === "topo" || v === "satellite") return v;
  } catch {}
  return "water";
}

let burnsCache: any | null = null;
async function loadBurns(): Promise<any> {
  if (burnsCache) return burnsCache;
  const res = await fetch("/data/burns.geojson");
  if (!res.ok) throw new Error(`burns.geojson HTTP ${res.status}`);
  burnsCache = await res.json();
  return burnsCache;
}

const esc = (s: string) => s.replace(/[<>]/g, "");

export default function ForageMap({ lat, lon, onSelect }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const burnLayerRef = useRef<any>(null);
  const forestLayerRef = useRef<any>(null);
  const baseLayerRef = useRef<any>(null);
  const hydroLayerRef = useRef<any>(null);

  const [showBurns, setShowBurns] = useState(false);
  const [burnCount, setBurnCount] = useState<number | null>(null);
  const [burnsLoading, setBurnsLoading] = useState(false);
  const [showForest, setShowForest] = useState(false);
  const [basemap, setBasemap] = useState<BasemapId>("water");
  const [mapReady, setMapReady] = useState(false);

  // localStorage is client-only; read after mount so the static export's HTML matches.
  useEffect(() => setBasemap(readBasemap()), []);

  // Load Leaflet once
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const init = async () => {
      if (!window.L) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        await new Promise<void>((resolve) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          s.onload = () => resolve();
          document.head.appendChild(s);
        });
      }
      if (cancelled || !elRef.current || mapRef.current) return;

      const L = window.L;
      const start: [number, number] =
        lat != null && lon != null ? [lat, lon] : [37.9235, -122.5965];

      mapRef.current = L.map(elRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView(start, 11);

      L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

      mapRef.current.on("click", (e: any) => {
        onSelect(e.latlng.lat, e.latlng.lng);
      });
      setMapReady(true);
    };

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker + view when lat/lon change
  useEffect(() => {
    if (!mapRef.current || !window.L || lat == null || lon == null) return;
    const L = window.L;
    const pos: [number, number] = [lat, lon];

    if (!markerRef.current) {
      const icon = L.divIcon({
        html: PIN_HTML,
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      markerRef.current = L.marker(pos, { icon }).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng(pos);
    }
    mapRef.current.setView(pos, mapRef.current.getZoom(), { animate: true });
  }, [lat, lon]);

  // Basemap (+ the USGS water overlay where the style wants it). zIndex keeps
  // the order base (1) < forest WMS (3) < water (5), so the forest tint never
  // washes out the creeks.
  useEffect(() => {
    if (!mapReady || !window.L) return;
    const L = window.L;
    const map = mapRef.current;
    const def = BASEMAPS[basemap];

    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    baseLayerRef.current = L.tileLayer(def.base.url, {
      attribution: def.base.attribution,
      maxNativeZoom: def.base.maxNativeZoom,
      maxZoom: 19,
      zIndex: 1,
    }).addTo(map);

    if (def.hydro) {
      if (!hydroLayerRef.current) {
        hydroLayerRef.current = L.tileLayer(USGS_HYDRO, {
          attribution: "Water: USGS National Hydrography",
          maxNativeZoom: 16,
          maxZoom: 19,
          zIndex: 5,
        });
      }
      hydroLayerRef.current.addTo(map);
    } else if (hydroLayerRef.current) {
      map.removeLayer(hydroLayerRef.current);
    }

    try {
      localStorage.setItem(BASEMAP_KEY, basemap);
    } catch {}
  }, [basemap, mapReady]);

  // Burn perimeter layer — load on first toggle, add/remove on toggle.
  // Age → morel window is decided by classifyBurn (current-year-relative).
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;
    let cancelled = false;

    const apply = async () => {
      if (!showBurns) {
        if (burnLayerRef.current) map.removeLayer(burnLayerRef.current);
        return;
      }
      if (!burnLayerRef.current) {
        setBurnsLoading(true);
        try {
          const data = await loadBurns();
          if (cancelled) return;
          const layer = L.geoJSON(data, {
            style: (f: any) => {
              const c = classifyBurn(Number(f?.properties?.year), new Date());
              return { color: c.color, weight: 1, fillColor: c.color, fillOpacity: c.fillOpacity };
            },
            onEachFeature: (f: any, lyr: any) => {
              const p = f.properties || {};
              const name = esc(String(p.name || "Unnamed fire"));
              const year = p.year ?? "?";
              const acres = p.acres ? Number(p.acres).toLocaleString() + " ac" : "—";
              const c = classifyBurn(Number(p.year), new Date());
              const since =
                c.springsSince <= 0
                  ? "burned this year"
                  : `${c.springsSince} spring${c.springsSince === 1 ? "" : "s"} since burn`;
              const hintColor = c.window === "prime" ? "#bd7a12" : "inherit";
              const hintWeight = c.window === "prime" ? "600" : "400";
              lyr.bindPopup(
                `<div style="font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size:11px; line-height:1.6;">
                   <div style="font-family: Newsreader, Spectral, Georgia, serif; font-size:16px; font-weight:500; letter-spacing:-0.01em;">${name}</div>
                   <div style="opacity:0.7; letter-spacing:0.08em; text-transform:uppercase; margin-top:2px;">${year} · ${acres} · ${since}</div>
                   <div style="margin-top:6px; color:${hintColor}; font-weight:${hintWeight};">${c.label}</div>
                 </div>`,
              );
            },
          });
          burnLayerRef.current = layer;
          setBurnCount(data?.features?.length ?? 0);
        } catch (e) {
          console.warn("burn layer load failed", e);
          setBurnCount(0);
        } finally {
          setBurnsLoading(false);
        }
      }
      if (burnLayerRef.current) burnLayerRef.current.addTo(map);
    };

    apply();
    return () => {
      cancelled = true;
    };
  }, [showBurns]);

  // Forest / vegetation-type overlay — LANDFIRE EVT WMS, added/removed on toggle.
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;

    if (!showForest) {
      if (forestLayerRef.current) map.removeLayer(forestLayerRef.current);
      return;
    }
    if (!forestLayerRef.current) {
      forestLayerRef.current = L.tileLayer.wms(FOREST_WMS, {
        layers: FOREST_LAYER,
        format: "image/png",
        transparent: true,
        version: "1.3.0",
        opacity: 0.5,
        zIndex: 3,
        attribution: "Vegetation: LANDFIRE 2023 EVT · USGS",
      });
    }
    forestLayerRef.current.addTo(map);
  }, [showForest]);

  const nowYear = new Date().getFullYear();

  return (
    <>
      <div
        ref={elRef}
        style={{ position: "absolute", inset: 0, background: "var(--parchment-deep)" }}
      />

      {/* Layer toggles (top-right, stacked) */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <BasemapSwitch value={basemap} onChange={setBasemap} />
        <LayerToggle
          on={showBurns}
          onColor="var(--rust)"
          onBorder="var(--rust-deep)"
          dot="var(--rust)"
          busy={burnsLoading}
          onClick={() => setShowBurns((v) => !v)}
          label={
            burnsLoading
              ? "Loading burns…"
              : showBurns
                ? `Burns ON${burnCount != null ? ` · ${burnCount}` : ""}`
                : "Show burns"
          }
        />
        <LayerToggle
          on={showForest}
          onColor="var(--moss)"
          onBorder="var(--moss-mid)"
          dot="var(--moss)"
          busy={false}
          onClick={() => setShowForest((v) => !v)}
          label={showForest ? "Forest ON" : "Forest type"}
        />
      </div>

      {/* Combined legend (bottom-left) */}
      {(showForest || (showBurns && !burnsLoading && (burnCount ?? 0) > 0)) && (
        <div
          className="font-mono"
          style={{
            position: "absolute",
            bottom: 16,
            left: 12,
            zIndex: 1000,
            padding: "10px 14px",
            background: "rgba(250,245,233,0.94)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            fontSize: 9.5,
            letterSpacing: "0.08em",
            color: "var(--ink-soft)",
            lineHeight: 1.6,
            boxShadow: "0 2px 8px -2px rgba(44,38,32,0.18)",
            maxWidth: 210,
          }}
        >
          {showBurns && (burnCount ?? 0) > 0 && (
            <div style={{ marginBottom: showForest ? 10 : 0 }}>
              <LegendHead>Wildfire perimeters</LegendHead>
              {([nowYear - 1, nowYear - 2, nowYear] as number[]).map((y) => {
                const c = classifyBurn(y, new Date());
                return (
                  <div key={y} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 14,
                        height: 10,
                        background: c.color,
                        opacity: c.fillOpacity + 0.35,
                        border: `1px solid ${c.color}`,
                        borderRadius: 2,
                        flex: "none",
                      }}
                    />
                    <span>{y}</span>
                    <span style={{ opacity: 0.65, fontStyle: "italic" }}>{c.legend}</span>
                  </div>
                );
              })}
              <div style={{ marginTop: 6, opacity: 0.55, fontSize: 8.5, letterSpacing: "0.1em" }}>
                ≥500 ac · NIFC
              </div>
            </div>
          )}
          {showForest && (
            <div>
              <LegendHead>Forest &amp; vegetation type</LegendHead>
              <div style={{ opacity: 0.8 }}>
                Greens = forest / conifer · tans = shrub &amp; grass.
              </div>
              <div style={{ marginTop: 6, opacity: 0.55, fontSize: 8.5, letterSpacing: "0.1em" }}>
                LANDFIRE 2023 EVT · US only
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function BasemapSwitch({ value, onChange }: { value: BasemapId; onChange: (v: BasemapId) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Map style"
      className="font-mono"
      style={{
        display: "flex",
        padding: 3,
        gap: 2,
        background: "rgba(250,245,233,0.94)",
        border: "1px solid var(--line)",
        borderRadius: 999,
        boxShadow: "0 2px 8px -2px rgba(44,38,32,0.25)",
      }}
    >
      {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => {
        const on = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: 0,
              background: on ? "var(--rain)" : "transparent",
              color: on ? "#faf5e9" : "var(--ink)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {BASEMAPS[id].label}
          </button>
        );
      })}
    </div>
  );
}

function LegendHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function LayerToggle({
  on,
  onColor,
  onBorder,
  dot,
  busy,
  onClick,
  label,
}: {
  on: boolean;
  onColor: string;
  onBorder: string;
  dot: string;
  busy: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono"
      aria-pressed={on}
      style={{
        padding: "8px 12px",
        background: on ? onColor : "rgba(250,245,233,0.94)",
        color: on ? "#faf5e9" : "var(--ink)",
        border: on ? `1px solid ${onBorder}` : "1px solid var(--line)",
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        cursor: "pointer",
        boxShadow: "0 2px 8px -2px rgba(44,38,32,0.25)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: on ? "#faf5e9" : dot,
          opacity: busy ? 0.4 : 1,
          flex: "none",
        }}
      />
      {label}
    </button>
  );
}
