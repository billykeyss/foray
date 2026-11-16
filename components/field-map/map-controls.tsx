"use client";

import type { BaseId } from "./styles.ts";
import type { Overlays } from "./layers.ts";

interface Props {
  base: BaseId;
  onBase: (b: BaseId) => void;
  tilted: boolean;
  onTilt: (t: boolean) => void;
  overlays: Overlays;
  onOverlays: (o: Overlays) => void;
  onLocate: () => void;
}

const CSS = `
.kp-ctl{
  position:absolute;right:12px;top:calc(116px + env(safe-area-inset-top));z-index:5;display:flex;flex-direction:column;gap:8px}
@media (min-width:1024px){.kp-ctl{top:calc(12px + env(safe-area-inset-top))}}
.kp-ctl button{min-width:44px;min-height:44px;padding:0 10px;border-radius:12px;border:1px solid var(--kp-ink);
  background:var(--kp-bone);color:var(--kp-ink);font:600 12px/1 ui-monospace,monospace;letter-spacing:.06em;cursor:pointer;
  box-shadow:0 4px 12px -4px rgba(26,43,34,.4)}
.kp-ctl button[aria-pressed="true"]{background:var(--kp-river);color:var(--kp-bone);border-color:var(--kp-river)}
.kp-ctl button.kp-amber[aria-pressed="true"]{background:var(--kp-amber);color:var(--kp-amber-ink);border-color:var(--kp-amber-ink)}
.kp-ctl button:focus-visible{outline:3px solid var(--kp-amber);outline-offset:2px}
`;

export default function MapControls({ base, onBase, tilted, onTilt, overlays, onOverlays, onLocate }: Props) {
  return (
    <div className="kp kp-ctl">
      <style>{CSS}</style>
      <button
        type="button"
        aria-label={base === "satellite" ? "Switch to topo map" : "Switch to satellite map"}
        aria-pressed={base === "topo"}
        onClick={() => onBase(base === "satellite" ? "topo" : "satellite")}
      >
        {base === "satellite" ? "SAT" : "TOPO"}
      </button>
      <button
        type="button"
        aria-label="Toggle 3D terrain tilt"
        aria-pressed={tilted}
        onClick={() => onTilt(!tilted)}
      >
        3D
      </button>
      <button
        type="button"
        className="kp-amber"
        aria-label="Toggle National Forest land overlay"
        aria-pressed={overlays.forest}
        onClick={() => onOverlays({ ...overlays, forest: !overlays.forest })}
      >
        NF
      </button>
      <button
        type="button"
        className="kp-amber"
        aria-label="Toggle BLM land overlay"
        aria-pressed={overlays.blm}
        onClick={() => onOverlays({ ...overlays, blm: !overlays.blm })}
      >
        BLM
      </button>
      <button type="button" aria-label="Center on my location" onClick={onLocate}>
        GPS
      </button>
    </div>
  );
}
