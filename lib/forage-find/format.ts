/** Unit formatting for Forage Finder. The engine keeps metric text (for the Ask model) plus raw
 *  numbers on each reason (`q`); the UI formats those for the user's unit choice. Pure. */
import type { Reason } from "./score.ts";

export type UnitSystem = "metric" | "imperial";

/** The app's one unit preference is elevation m/ft; ft means a US user, so imperial throughout. */
export const unitSystemFor = (elevation: "m" | "ft"): UnitSystem => (elevation === "ft" ? "imperial" : "metric");

export function fmtRain(mm: number, u: UnitSystem): string {
  if (u === "metric") return `${Math.round(mm)} mm`;
  const inch = mm / 25.4;
  return `${inch >= 10 ? Math.round(inch) : Math.round(inch * 10) / 10} in`;
}

export function fmtTemp(c: number, u: UnitSystem): string {
  return u === "metric" ? `${Math.round(c)} °C` : `${Math.round((c * 9) / 5 + 32)} °F`;
}

export function fmtElev(m: number, u: UnitSystem): string {
  const v = u === "metric" ? Math.round(m) : Math.round(m * 3.28084);
  return `${v.toLocaleString("en-US")} ${u === "metric" ? "m" : "ft"}`;
}

/** A reason chip's text in the user's units. */
export function reasonText(r: Pick<Reason, "text" | "q">, u: UnitSystem): string {
  if (!r.q) return r.text;
  const v = r.q.kind === "rain" ? fmtRain(r.q.value, u) : fmtTemp(r.q.value, u);
  return r.q.tpl.replace("{v}", v);
}
