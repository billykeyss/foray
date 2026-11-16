"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "@/lib/location-context";

// Reno-centric foraging waypoints — drives sorted by distance from Reno.
// Add your own with the "Drop pin here" option (paste coordinates above).
const PRESETS: { label: string; lat: number; lon: number; group?: string }[] = [
  // Near Reno (≤1hr)
  { label: "Tahoe Meadows", lat: 39.312, lon: -119.896, group: "Near Reno" },
  { label: "Galena Creek", lat: 39.362, lon: -119.837, group: "Near Reno" },
  { label: "Spooner Summit", lat: 39.106, lon: -119.912, group: "Near Reno" },
  { label: "Mt. Rose Wilderness", lat: 39.343, lon: -119.916, group: "Near Reno" },
  // Tahoe / Truckee (~1-1.5hr)
  { label: "Truckee", lat: 39.328, lon: -120.183, group: "Tahoe Basin" },
  { label: "Donner Summit", lat: 39.315, lon: -120.336, group: "Tahoe Basin" },
  { label: "Tahoe West Shore", lat: 39.097, lon: -120.123, group: "Tahoe Basin" },
  { label: "Echo Summit", lat: 38.812, lon: -120.034, group: "Tahoe Basin" },
  // Day drives (~2-3hr)
  { label: "Sierra City / Yuba", lat: 39.567, lon: -120.629, group: "Day drives" },
  { label: "Carson Pass", lat: 38.694, lon: -119.986, group: "Day drives" },
  { label: "Ebbetts Pass", lat: 38.545, lon: -119.812, group: "Day drives" },
  { label: "Plumas NF · Quincy", lat: 39.937, lon: -120.947, group: "Day drives" },
  { label: "Lassen NF", lat: 40.487, lon: -121.407, group: "Day drives" },
  // Longer trips
  { label: "Eastern Sierra · June Lake", lat: 37.779, lon: -119.073, group: "Weekend trips" },
  { label: "Sonora Pass", lat: 38.328, lon: -119.636, group: "Weekend trips" },
  { label: "Lamoille Canyon · Ruby Mtns", lat: 40.652, lon: -115.472, group: "Weekend trips" },
];

function parseCoords(input: string): [number, number] | null {
  const m = input.match(
    /^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/
  );
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

type Preset = (typeof PRESETS)[number];
function groupedPresets(
  items: Preset[]
): [string | undefined, Preset[]][] {
  const order: (string | undefined)[] = [];
  const map = new Map<string | undefined, Preset[]>();
  for (const p of items) {
    if (!map.has(p.group)) {
      map.set(p.group, []);
      order.push(p.group);
    }
    map.get(p.group)!.push(p);
  }
  return order.map((g) => [g, map.get(g)!]);
}

interface Props {
  /** Controlled open state (optional). Lets another control, e.g. a search button, open the chooser. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Replaces the default pill trigger. */
  renderTrigger?: (p: { open: boolean; toggle: () => void }) => ReactNode;
  /** Wrapper class (default "relative inline-block"). */
  className?: string;
}

export default function LocationChooser({ open: openProp, onOpenChange, renderTrigger, className }: Props = {}) {
  const { label, lat, lon, setLocation, loading } = useLocation();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    setOpenState(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = useState("");
  const [usingGeo, setUsingGeo] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const filtered = q
    ? PRESETS.filter((p) => p.label.toLowerCase().includes(q))
    : PRESETS;
  const coordHit = parseCoords(query);

  const pick = (la: number, lo: number, lbl: string) => {
    setLocation(la, lo, lbl);
    setOpen(false);
    setQuery("");
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    setUsingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pick(
          pos.coords.latitude,
          pos.coords.longitude,
          `My location (${pos.coords.latitude.toFixed(2)}°N)`
        );
        setUsingGeo(false);
      },
      () => setUsingGeo(false),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  return (
    <div ref={wrapRef} className={className ?? "relative inline-block"}>
      {renderTrigger ? renderTrigger({ open, toggle: () => setOpen((v) => !v) }) : (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pill"
        style={{ cursor: "pointer" }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--rust)",
            boxShadow: "0 0 0 3px rgba(161, 74, 42, 0.2)",
            display: "inline-block",
          }}
        />
        <strong style={{ color: "var(--moss)", fontWeight: 600 }}>
          {loading && !label ? "Loading…" : label || "Unnamed spot"}
        </strong>
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ color: "var(--ink-soft)" }}>
          {lat != null ? `${lat.toFixed(2)}°N` : "—"}
        </span>
        <span
          style={{
            marginLeft: 4,
            opacity: 0.55,
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.18s",
            fontSize: 9,
          }}
        >
          ▾
        </span>
      </button>
      )}

      {open && (
        <div
          className="absolute z-30 mt-2 left-0"
          style={{
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--parchment)",
            border: "1px solid var(--line)",
            borderRadius: 18,
            boxShadow: "0 18px 40px -16px rgba(26, 20, 16, 0.35)",
            padding: 12,
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, or 41.41, -122.19"
            className="field-input"
            style={{ marginBottom: 8 }}
          />

          {coordHit && (
            <button
              type="button"
              onClick={() =>
                pick(
                  coordHit[0],
                  coordHit[1],
                  `Pin ${coordHit[0].toFixed(2)}, ${coordHit[1].toFixed(2)}`
                )
              }
              className="w-full text-left"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(161, 74, 42, 0.08)",
                border: "1px solid rgba(161, 74, 42, 0.35)",
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <div
                className="font-display italic"
                style={{ fontSize: 15, color: "var(--rust)" }}
              >
                Drop pin here
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 10,
                  color: "var(--ink-soft)",
                  letterSpacing: "0.05em",
                  marginTop: 2,
                }}
              >
                {coordHit[0].toFixed(4)}°, {coordHit[1].toFixed(4)}°
              </div>
            </button>
          )}

          <div
            className="font-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              color: "var(--ink-soft)",
              textTransform: "uppercase",
              padding: "6px 4px 4px",
              opacity: 0.6,
            }}
          >
            Saved spots
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div
                className="font-body italic"
                style={{
                  fontSize: 13,
                  color: "var(--ink-soft)",
                  padding: "8px 4px",
                }}
              >
                No matches. Try coordinates like 39.31, -119.89.
              </div>
            ) : (
              groupedPresets(filtered).map(([group, items]) => (
                <div key={group ?? "other"}>
                  {group && (
                    <div
                      className="font-mono"
                      style={{
                        fontSize: 8.5,
                        letterSpacing: "0.24em",
                        color: "var(--ink-soft)",
                        textTransform: "uppercase",
                        opacity: 0.5,
                        padding: "10px 4px 4px",
                      }}
                    >
                      {group}
                    </div>
                  )}
                  {items.map((p) => {
                    const active =
                      lat != null &&
                      Math.abs(lat - p.lat) < 0.001 &&
                      Math.abs((lon ?? 0) - p.lon) < 0.001;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => pick(p.lat, p.lon, p.label)}
                        className="w-full text-left flex items-baseline justify-between"
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: active
                            ? "rgba(44, 58, 42, 0.08)"
                            : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          className="font-display italic"
                          style={{
                            fontSize: 16,
                            color: "var(--moss)",
                            fontWeight: active ? 450 : 350,
                          }}
                        >
                          {p.label}
                        </span>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 9.5,
                            color: "var(--ink-soft)",
                            letterSpacing: "0.04em",
                            opacity: 0.7,
                          }}
                        >
                          {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--line)",
              marginTop: 8,
              paddingTop: 8,
            }}
          >
            <button
              type="button"
              onClick={useMyLocation}
              disabled={usingGeo}
              className="w-full font-mono"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--rust)",
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                padding: "8px 4px",
                cursor: usingGeo ? "wait" : "pointer",
                textAlign: "left",
              }}
            >
              {usingGeo ? "Locating…" : "Use my location →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
