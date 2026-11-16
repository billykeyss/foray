"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocation } from "@/lib/location-context";
import { computeSporeScore } from "@/lib/weather";
import { FISH_WATERS } from "@/lib/fishing/waters-index.ts";

const FieldMap = dynamic(() => import("@/components/field-map/field-map.tsx"), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 grid place-items-center font-mono"
      style={{
        background: "var(--parchment-deep)",
        fontSize: 10,
        letterSpacing: "0.22em",
        color: "var(--ink-soft)",
      }}
    >
      LOADING TERRAIN…
    </div>
  ),
});

function parseCoords(input: string): [number, number] | null {
  const m = input.match(
    /^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/
  );
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

export default function MapPage() {
  const { lat, lon, label, weather, setLocation, loading } = useLocation();
  const reading = useMemo(
    () => (weather.length ? computeSporeScore(weather) : null),
    [weather]
  );
  const [input, setInput] = useState("");
  const forageSpots = useMemo(
    () =>
      lat != null && lon != null
        ? [{ id: "pin", lon, lat, label: label || "Pin" }]
        : [],
    [lat, lon, label]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseCoords(input);
    if (p) {
      setLocation(p[0], p[1], `Pin ${p[0].toFixed(2)}, ${p[1].toFixed(2)}`);
      setInput("");
    }
  };

  return (
    <main className="absolute inset-0 z-0">
      <FieldMap
        center={[lon ?? -122.5965, lat ?? 37.9235]}
        base="satellite"
        overlays={{ forest: false, blm: false }}
        forageSpots={forageSpots}
        waters={FISH_WATERS}
        spotlightLine={null}
        onWaterTap={() => {}}
        onSpotTap={() => {}}
        onLongPress={(lo, la) =>
          setLocation(la, lo, `Pin ${la.toFixed(2)}, ${lo.toFixed(2)}`)
        }
      />

      {/* top search overlay */}
      <div
        className="absolute left-4 right-4 lg:left-1/2 lg:-translate-x-1/2 lg:w-[520px] lg:right-auto z-[400]"
        style={{ top: "max(16px, env(safe-area-inset-top))" }}
      >
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-3 px-4 py-3"
          style={{
            background: "rgba(240, 228, 200, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid var(--line)",
            borderRadius: 18,
            boxShadow: "0 12px 32px -12px rgba(26, 20, 16, 0.25)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="var(--moss)"
            strokeWidth={1.6}
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11 L14 14" />
          </svg>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              lat != null && lon != null
                ? `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`
                : "37.9512, -122.2792"
            }
            className="flex-1 bg-transparent outline-none font-mono"
            style={{
              fontSize: 12,
              color: "var(--moss)",
              letterSpacing: "0.04em",
            }}
          />
          <button
            type="submit"
            aria-label="Use coordinate"
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--rust)"
              strokeWidth={1.5}
            >
              <circle cx="8" cy="8" r="2" />
              <circle cx="8" cy="8" r="6" />
            </svg>
          </button>
        </form>
        <div className="mt-3 flex justify-center">
          <span
            className="font-mono inline-flex items-center gap-2"
            style={{
              background: "var(--moss)",
              color: "var(--parchment)",
              borderRadius: 100,
              padding: "7px 13px",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Press and hold to drop a pin
          </span>
        </div>
      </div>

      {/* bottom sheet */}
      <div
        className="map-sheet absolute left-2 right-2 lg:left-auto lg:right-6 lg:w-[400px] z-[400]"
        style={{
          background: "rgba(240, 228, 200, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 24,
          border: "1px solid var(--line)",
          padding: "20px 20px 18px",
          boxShadow: "0 -20px 40px -20px rgba(26, 20, 16, 0.3)",
        }}
      >
        <div
          className="mx-auto"
          style={{
            width: 36,
            height: 4,
            background: "var(--line)",
            borderRadius: 4,
            marginTop: -8,
            marginBottom: 14,
          }}
        />
        <div className="flex justify-between items-baseline">
          <div>
            <div
              className="font-display italic"
              style={{
                fontSize: 22,
                fontWeight: 350,
                color: "var(--moss)",
                lineHeight: 1.1,
              }}
            >
              {label || "Unnamed spot"}
            </div>
            <div
              className="font-mono mt-1"
              style={{
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "var(--ink-soft)",
              }}
            >
              {lat != null && lon != null
                ? `${lat.toFixed(4)}°N, ${Math.abs(lon).toFixed(4)}°W`
                : "—"}
            </div>
          </div>
          <div
            className="font-display"
            style={{
              fontSize: 32,
              fontWeight: 350,
              color: "var(--rust)",
            }}
          >
            {loading ? "…" : reading?.score ?? "—"}
            <sub
              className="font-mono"
              style={{
                fontSize: 11,
                color: "var(--ink-soft)",
                marginLeft: 2,
                bottom: 0,
              }}
            >
              /100
            </sub>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2.5 mt-4">
          <Link href="/" className="btn-primary text-center">
            View Forecast →
          </Link>
          <Link
            href="/journal"
            className="grid place-items-center"
            style={{
              width: 48,
              height: 48,
              border: "1px solid var(--moss)",
              borderRadius: "50%",
              color: "var(--moss)",
            }}
            aria-label="Save to journal"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M5 4 L19 4 L19 21 L12 18 L5 21 Z" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
