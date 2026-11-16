import { sunTimes } from "./daylight.ts";

type Spec = Record<string, unknown>;

export interface HoursWindow {
  from: Date;
  to: Date;
}

/** Resolve one `allowed_from`/`allowed_to` TimeSpec for `date` at the water's coordinates.
 *  Supports `{anchor: sunrise|sunset, offset_minutes}` and clock strings ("5:00 AM", "17:30").
 *  Anything else returns null (the caller shows the rule text instead of guessing). */
function resolveSpec(spec: unknown, lat: number, lon: number, date: Date): Date | null {
  if (typeof spec === "string") {
    const m = /^\s*(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?\s*$/i.exec(spec);
    if (!m) return null;
    let h = +m[1];
    const min = +m[2];
    if (m[3]) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (m[3][0].toLowerCase() === "p" ? 12 : 0);
    }
    if (h > 23 || min > 59) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, min);
  }
  if (!spec || typeof spec !== "object") return null;
  const s = spec as Spec;
  if (s.anchor !== "sunrise" && s.anchor !== "sunset") return null;
  const off = s.offset_minutes == null ? 0 : s.offset_minutes;
  if (typeof off !== "number" || !Number.isFinite(off)) return null;
  const t = sunTimes(lat, lon, date)[s.anchor];
  if (Number.isNaN(t.getTime())) return null;
  return new Date(t.getTime() + off * 60000);
}

/** Today's legal window for a `fishing_hours` rule's parameters, or null when not interpretable. */
export function fishingHoursWindow(detail: Spec, lat: number, lon: number, date: Date): HoursWindow | null {
  if (detail.allowed_from == null || detail.allowed_to == null) return null;
  const from = resolveSpec(detail.allowed_from, lat, lon, date);
  const to = resolveSpec(detail.allowed_to, lat, lon, date);
  return from && to ? { from, to } : null;
}

/** "6:12 AM" in device time. */
export const fmtClock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export interface HoursScope {
  kind: "water" | "reach";
  scope: string;
  rules: Array<{ ruleType: string; polarity: string; species: string[] }>;
}

export type HoursPick<R> =
  | { kind: "water"; rule: R }
  | { kind: "varies"; rule: R; why: "section" | "species" }
  | null;

/** Choose which `fishing_hours` rule may be presented as the water's hours. Only an all-species rule
 *  in the water scope counts as water-wide; reach- or species-specific rules yield "varies". */
export function pickHoursRule<R extends HoursScope["rules"][number]>(
  scopes: Array<{ kind: "water" | "reach"; rules: R[] }>,
): HoursPick<R> {
  const hours = (s: { rules: R[] }) => s.rules.filter((r) => r.ruleType === "fishing_hours" && r.polarity !== "asserts_none");
  const water = scopes.filter((s) => s.kind === "water").flatMap(hours);
  const wide = water.find((r) => r.species.length === 0);
  if (wide) return { kind: "water", rule: wide };
  if (water.length) return { kind: "varies", rule: water[0], why: "species" };
  const reach = scopes.filter((s) => s.kind === "reach").flatMap(hours);
  return reach.length ? { kind: "varies", rule: reach[0], why: "section" } : null;
}
