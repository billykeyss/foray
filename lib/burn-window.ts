/**
 * Morel-window classification for a wildfire perimeter.
 *
 * Morels flush most heavily the FIRST spring after a conifer fire, taper the
 * second, and this year's burns are still too fresh. This is the single source
 * of truth for how a burn's *age* maps to morel-hunting value — pure and
 * current-year-relative so the map never rots (the values used to be hardcoded
 * to 2026 in three places). Colors use the app's chanterelle/rust palette.
 */

export type MorelWindow = "prime" | "fresh" | "fading" | "old";

export interface BurnClass {
  /** whole calendar years between the fire year and `now` */
  springsSince: number;
  window: MorelWindow;
  /** popup line */
  label: string;
  /** short legend note */
  legend: string;
  color: string;
  fillOpacity: number;
}

const WINDOWS: Record<MorelWindow, Omit<BurnClass, "springsSince">> = {
  prime: { window: "prime", label: "★ prime morel window", legend: "last year — prime", color: "#bd7a12", fillOpacity: 0.42 },
  fading: { window: "fading", label: "past peak — some morels", legend: "2 yrs — fading", color: "#7d3418", fillOpacity: 0.3 },
  fresh: { window: "fresh", label: "too fresh for morels", legend: "this year — too fresh", color: "#9a3a2a", fillOpacity: 0.18 },
  old: { window: "old", label: "past morel window", legend: "older", color: "#8a8378", fillOpacity: 0.14 },
};

export function classifyBurn(fireYear: number, now: Date): BurnClass {
  const springsSince = now.getFullYear() - fireYear;
  const window: MorelWindow =
    springsSince <= 0 ? "fresh" : springsSince === 1 ? "prime" : springsSince === 2 ? "fading" : "old";
  return { springsSince, ...WINDOWS[window] };
}
