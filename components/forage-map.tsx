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

  const [showBurns, setShowBurns] = useState(false);
  const [burnCount, setBurnCount] = useState<number | null>(null);
  const [burnsLoading, setBurnsLoading] = useState(false);
  const [showForest, setShowForest] = useState(false);

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

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
        {
          attribution: "© OpenStreetMap · CARTO",
          maxZoom: 19,
        }
      ).addTo(mapRef.current);

      L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

      mapRef.current.on("click", (e: any) => {
        onSelect(e.latlng.lat, e.latlng.lng);
      });
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
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
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
