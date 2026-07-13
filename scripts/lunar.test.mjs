import { test } from "node:test";
import assert from "node:assert/strict";
import { moonPhase, springStrength } from "../lib/lunar.ts";

// Reference lunar events (UTC). springStrength is |cos(2π·phase)| → 1 at
// new/full (spring tides, lowest lows) and 0 at the quarters (neap tides).
const NEW_MOON = new Date("2024-01-11T11:57:00Z");
const FIRST_QUARTER = new Date("2024-01-18T03:53:00Z");
const FULL_MOON = new Date("2024-01-25T17:54:00Z");

test("phase is ~0 at a new moon and ~0.5 at a full moon", () => {
  const pNew = moonPhase(NEW_MOON);
  assert.ok(pNew < 0.05 || pNew > 0.95, `new-moon phase ${pNew}`);
  assert.ok(Math.abs(moonPhase(FULL_MOON) - 0.5) < 0.05, `full-moon phase ${moonPhase(FULL_MOON)}`);
});

test("spring tides (new/full) score high; neap (quarter) scores low", () => {
  assert.ok(springStrength(NEW_MOON) > 0.85, `new ${springStrength(NEW_MOON)}`);
  assert.ok(springStrength(FULL_MOON) > 0.85, `full ${springStrength(FULL_MOON)}`);
  assert.ok(springStrength(FIRST_QUARTER) < 0.35, `quarter ${springStrength(FIRST_QUARTER)}`);
});

test("springStrength is bounded to [0,1]", () => {
  for (let d = 0; d < 30; d++) {
    const s = springStrength(new Date(2026, 5, 1 + d));
    assert.ok(s >= 0 && s <= 1, `${d}: ${s}`);
  }
});
