/**
 * Moon phase → spring/neap tide strength, computed purely from a date so it
 * works offline. Shellfish/intertidal harvest wants the lowest low tides, which
 * occur on *spring tides* near the new and full moon; the quarters give weak
 * *neap* tides. This is a coarse heuristic (spring-vs-neap), not a tide table.
 */

const SYNODIC = 29.530588853; // mean days between new moons
// A well-determined new moon (2000-01-06 18:14 UTC) as the phase epoch.
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

/** Fraction through the lunation: 0 = new, 0.5 = full, →1 = next new. */
export function moonPhase(now: Date): number {
  const days = (now.getTime() - NEW_MOON_EPOCH) / 86400000;
  const p = (days / SYNODIC) % 1;
  return p < 0 ? p + 1 : p;
}

/** 1 at new/full (spring tides — best exposure), 0 at the quarters (neaps). */
export function springStrength(now: Date): number {
  return Math.abs(Math.cos(2 * Math.PI * moonPhase(now)));
}
