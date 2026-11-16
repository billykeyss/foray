// Sunrise/sunset via NOAA's published solar equations (the ones behind the NOAA Solar Calculator
// spreadsheet). No dependencies. Accurate to about a minute at mid latitudes.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Julian day for 0h UT of the given UTC calendar date. */
function julianDay(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;
}

function solar(jc: number) {
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360;
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  const Mr = rad(M);
  const C =
    Math.sin(Mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * jc;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const L0r = rad(L0);
  const eqTime =
    4 *
    deg(
      y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
        0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr),
    );
  return { decl, eqTime };
}

/** Minutes after 0h UT (of the UTC date) of sunrise (rise=true) or sunset. null = no event (polar). */
function eventMinutes(jd: number, lat: number, lon: number, rise: boolean): number | null {
  const t = (minutes: number) => (jd + minutes / 1440 - 2451545) / 36525;
  let { decl, eqTime } = solar(t(720));
  const ha = (d: number) => {
    const c =
      Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(d))) - Math.tan(rad(lat)) * Math.tan(rad(d));
    return c < -1 || c > 1 ? null : deg(Math.acos(c));
  };
  const sign = rise ? 1 : -1;
  let h = ha(decl);
  if (h == null) return null;
  let mins = 720 - 4 * (lon + sign * h) - eqTime;
  // Refine with the sun's position at the first estimate.
  ({ decl, eqTime } = solar(t(mins)));
  h = ha(decl);
  if (h == null) return null;
  return 720 - 4 * (lon + sign * h) - eqTime;
}

/** Sunrise and sunset instants for the local calendar date `date` (its device-local Y/M/D) at the
 *  given coordinates. Returns UTC-correct `Date`s; format them in device time. */
export function sunTimes(lat: number, lon: number, date: Date): { sunrise: Date; sunset: Date } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const base = julianDay(y, m, d);
  const pick = (rise: boolean) => {
    // Try the UTC days around the local date; keep the instant that falls on the local calendar date.
    let best: Date | null = null;
    for (const off of [-1, 0, 1]) {
      const mins = eventMinutes(base + off, lat, lon, rise);
      if (mins == null) continue;
      const inst = new Date((base + off - 2440587.5) * 86400000 + mins * 60000);
      if (inst.getFullYear() === y && inst.getMonth() + 1 === m && inst.getDate() === d) {
        best = inst;
        break;
      }
    }
    return best ?? new Date(NaN);
  };
  return { sunrise: pick(true), sunset: pick(false) };
}
