"use client";

import { useEffect, useRef, useState } from "react";
import type { BaseId } from "./styles.ts";
import type { Overlays } from "./layers.ts";
import { classifyBurn } from "@/lib/burn-window.ts";

export type BurnsState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; count: number } | { kind: "error" };

interface Props {
  base: BaseId;
  onBase: (b: BaseId) => void;
  tilted: boolean;
  onTilt: (t: boolean) => void;
  overlays: Overlays;
  onOverlays: (o: Overlays) => void;
  onLocate: () => void;
  locating?: boolean;
  burns: BurnsState;
}

const CSS = `
.kp-ctl{
  position:absolute;right:12px;top:calc(116px + env(safe-area-inset-top));z-index:5;display:flex;flex-direction:column;gap:8px}
@media (min-width:1024px){.kp-ctl{top:calc(12px + env(safe-area-inset-top))}}
.kp-ctl button{min-width:44px;min-height:44px;padding:0 10px;border-radius:12px;border:1px solid var(--kp-ink);
  background:var(--kp-bone);color:var(--kp-ink);font:600 12px/1 ui-monospace,monospace;letter-spacing:.06em;cursor:pointer;
  box-shadow:0 4px 12px -4px rgba(26,43,34,.4)}
.kp-ctl button[aria-pressed="true"],.kp-ctl button[aria-expanded="true"]{background:var(--kp-river);color:var(--kp-bone);border-color:var(--kp-river)}
.kp-ctl button.kp-amber[aria-pressed="true"]{background:var(--kp-amber);color:var(--kp-amber-ink);border-color:var(--kp-amber-ink)}
.kp-ctl button:focus-visible{outline:3px solid var(--kp-amber);outline-offset:2px}
.kp-ctl .kp-ctl-layers{position:relative}
.kp-ctl .kp-ctl-count{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;border-radius:9px;padding:0 4px;
  background:var(--kp-amber);color:var(--kp-amber-ink);font:700 10px/18px ui-monospace,monospace;text-align:center;letter-spacing:0}
.kp-ctl-panel{position:absolute;right:calc(100% + 8px);top:-104px;width:212px;overscroll-behavior:contain;
  max-height:calc(100dvh - var(--kp-trip-peek, 46dvh) - 124px - env(safe-area-inset-top));overflow:auto;
  padding:8px;border-radius:14px;border:1px solid var(--kp-ink);background:var(--kp-bone);color:var(--kp-ink);
  box-shadow:0 8px 24px -8px rgba(26,43,34,.5);display:flex;flex-direction:column;gap:6px}
.kp-ctl-panel h2{margin:2px 4px 2px;font:600 10px/1.2 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--kp-ink-64)}
.kp-ctl .kp-ctl-panel button{display:flex;align-items:center;gap:8px;width:100%;text-align:left;box-shadow:none;
  font:600 12px/1.2 var(--kp-font-body, system-ui);letter-spacing:0;padding:6px 10px}
.kp-ctl-panel .kp-ctl-swatch{flex:none;width:14px;height:14px;border-radius:3px;border:1px solid currentColor}
.kp-ctl-panel .kp-ctl-sub{display:block;font:500 10px/1.3 ui-monospace,monospace;opacity:.75;margin-top:2px}
.kp-ctl-legend{position:absolute;right:calc(100% + 8px);top:0;width:176px;padding:8px 10px;border-radius:12px;
  border:1px solid var(--kp-ink-14);background:color-mix(in srgb,var(--kp-bone) 94%,transparent);color:var(--kp-ink);
  font:500 10px/1.5 ui-monospace,monospace;box-shadow:var(--kp-shadow-chip)}
.kp-ctl-legend h3{margin:0 0 2px;font:600 9.5px/1.3 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--kp-ink-64)}
.kp-ctl-legend .row{display:flex;align-items:center;gap:6px}
.kp-ctl-legend .sw{flex:none;width:12px;height:9px;border-radius:2px}
.kp-ctl-legend .src{margin-top:2px;opacity:.6;font-size:9px;letter-spacing:.06em}
@media (min-width:1024px){.kp-ctl-panel{max-height:calc(100dvh - 24px)}}
.kp-ctl-panel .kp-ctl-legend{position:static;width:auto;box-shadow:none;border-color:var(--kp-ink-12);margin-top:2px}
`;

/** Burn legend rows: this year and the two before it, classified like the map (current-year relative). */
function burnRows(now = new Date()) {
  const y = now.getFullYear();
  return [y - 1, y - 2, y].map((year) => ({ year, ...classifyBurn(year, now) }));
}

export function MapLegend({ overlays }: { overlays: Overlays }) {
  if (!overlays.burns && !overlays.vegetation) return null;
  return (
    <div className="kp-ctl-legend" aria-label="Map legend">
      {overlays.burns && (
        <div>
          <h3>Wildfire perimeters</h3>
          {burnRows().map((r) => (
            <div className="row" key={r.year}>
              <span className="sw" style={{ background: r.color, opacity: Math.min(1, r.fillOpacity + 0.35) }} aria-hidden />
              <span>{r.year}</span>
              <span style={{ opacity: 0.7, fontStyle: "italic" }}>{r.legend}</span>
            </div>
          ))}
          <div className="src">≥500 ac · NIFC</div>
        </div>
      )}
      {overlays.vegetation && (
        <div style={{ marginTop: overlays.burns ? 6 : 0 }}>
          <h3>Forest type</h3>
          <div>Greens = forest / conifer · tans = shrub &amp; grass</div>
          <div className="src">LANDFIRE 2023 EVT · US only</div>
        </div>
      )}
    </div>
  );
}

const LAYERS: Array<{ key: keyof Overlays; label: string; aria: string; swatch: string }> = [
  { key: "forest", label: "National Forest", aria: "Toggle National Forest land overlay", swatch: "#6f9a5a" },
  { key: "blm", label: "BLM land", aria: "Toggle BLM land overlay", swatch: "#e9c46a" },
  { key: "burns", label: "Burns", aria: "Toggle wildfire burn perimeters overlay", swatch: "#bd7a12" },
  { key: "vegetation", label: "Forest type", aria: "Toggle forest type (vegetation) overlay", swatch: "#3d7a3a" },
  { key: "hydro", label: "Water", aria: "Toggle water (creeks, ponds, springs) overlay", swatch: "#2f5d78" },
];

function burnsSub(b: BurnsState): string | null {
  if (b.kind === "loading") return "Loading…";
  if (b.kind === "error") return "Couldn’t load (offline?)";
  if (b.kind === "ready") return `${b.count.toLocaleString("en-US")} perimeters`;
  return null;
}

export default function MapControls({ base, onBase, tilted, onTilt, overlays, onOverlays, onLocate, locating, burns }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const active = LAYERS.filter((l) => overlays[l.key]).length;

  // Close the panel on Escape or a press outside the controls.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div className="kp kp-ctl" ref={wrap}>
      <style>{CSS}</style>
      <button
        type="button"
        aria-label={base === "satellite" ? "Switch to topo map" : "Switch to satellite map"}
        aria-pressed={base === "topo"}
        onClick={() => onBase(base === "satellite" ? "topo" : "satellite")}
      >
        {base === "satellite" ? "SAT" : "TOPO"}
      </button>
      <button type="button" aria-label="Toggle 3D terrain tilt" aria-pressed={tilted} onClick={() => onTilt(!tilted)}>
        3D
      </button>
      <div className="kp-ctl-layers">
        <button
          type="button"
          aria-label={`Map layers${active ? ` (${active} on)` : ""}`}
          aria-expanded={open}
          aria-controls="kp-ctl-panel"
          onClick={() => setOpen((v) => !v)}
          style={{ width: "100%" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
            <path d="M12 3 2 8l10 5 10-5-10-5z" />
            <path d="m2 13 10 5 10-5" />
          </svg>
          {active > 0 && <span className="kp-ctl-count" aria-hidden>{active}</span>}
        </button>
        {open ? (
          <div className="kp-ctl-panel" id="kp-ctl-panel" role="group" aria-label="Map layers">
            <h2>Layers</h2>
            {LAYERS.map((l) => {
              const sub = l.key === "burns" ? burnsSub(burns) : null;
              return (
                <button
                  key={l.key}
                  type="button"
                  className={l.key === "forest" || l.key === "blm" ? "kp-amber" : undefined}
                  aria-label={l.aria}
                  aria-pressed={overlays[l.key]}
                  aria-busy={l.key === "burns" && burns.kind === "loading" ? true : undefined}
                  onClick={() => onOverlays({ ...overlays, [l.key]: !overlays[l.key] })}
                >
                  <span className="kp-ctl-swatch" style={{ background: l.swatch }} aria-hidden />
                  <span>
                    {l.label}
                    {sub && overlays.burns && <span className="kp-ctl-sub">{sub}</span>}
                  </span>
                </button>
              );
            })}
            <MapLegend overlays={overlays} />
          </div>
        ) : (
          <MapLegend overlays={overlays} />
        )}
      </div>
      <button type="button" aria-label="Center on my location" aria-busy={locating || undefined} onClick={onLocate}>
        {locating ? "…" : "GPS"}
      </button>
    </div>
  );
}
