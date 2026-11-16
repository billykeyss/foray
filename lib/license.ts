// Fishing-license reminder logic. Pure and node-importable; the React hook lives in use-license.ts.

export type LicenseState = "CA" | "NV";
export interface License {
  state: LicenseState;
  /** YYYY-MM-DD, device-local calendar date. */
  expires: string;
}

export const LICENSE_KEY = "foray.license.v1";
const DAY = 86400000;

const isoDay = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
};

/** Tolerant parse: valid rows only, at most one per state (latest expiry wins). Never throws. */
export function parseLicenses(raw: string | null): License[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const best = new Map<LicenseState, License>();
    for (const l of v) {
      if (!l || (l.state !== "CA" && l.state !== "NV") || typeof l.expires !== "string" || isoDay(l.expires) == null) continue;
      const cur = best.get(l.state);
      if (!cur || l.expires > cur.expires) best.set(l.state, { state: l.state, expires: l.expires });
    }
    return [...best.values()];
  } catch {
    return [];
  }
}

/** Reminder for a water in `waterStates`. Evaluates only licenses for those states (any one suffices
 *  for a two-state water; the latest expiry is used). Returns null when the user has saved no
 *  licenses at all (they haven't opted in) or the license is fine. */
export function licenseWarning(
  licenses: License[],
  waterStates: string[],
  today: string,
): string | null {
  if (!licenses.length) return null;
  const relevant = licenses.filter((l) => waterStates.includes(l.state));
  if (!relevant.length) return `No ${waterStates[0] ?? "state"} license for this water`;
  const best = relevant.reduce((a, b) => (b.expires > a.expires ? b : a));
  const t = isoDay(today);
  const e = isoDay(best.expires);
  if (t == null || e == null) return null;
  const days = Math.round((e - t) / DAY);
  if (days < 0) return "License expired";
  if (days === 0) return "License expires today";
  if (days <= 14) return `License expires in ${days} day${days === 1 ? "" : "s"}`;
  return null;
}
