import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBurn } from "../lib/burn-window.ts";

// Morels flush the FIRST spring after a fire, fade by the second, and this
// year's burns are too fresh. The classifier must be *current-year-relative*
// (the whole point — the old map hardcoded 2026).
test("last year's burn is the prime morel window", () => {
  assert.equal(classifyBurn(2026, new Date(2027, 5, 1)).window, "prime");
  assert.equal(classifyBurn(2025, new Date(2026, 5, 1)).window, "prime");
});

test("this year's burn is too fresh", () => {
  assert.equal(classifyBurn(2027, new Date(2027, 5, 1)).window, "fresh");
  assert.equal(classifyBurn(2026, new Date(2026, 5, 1)).window, "fresh");
});

test("two springs on is fading", () => {
  assert.equal(classifyBurn(2025, new Date(2027, 5, 1)).window, "fading");
});

test("three-plus springs is past the window", () => {
  assert.equal(classifyBurn(2024, new Date(2027, 5, 1)).window, "old");
});

test("springsSince is the calendar-year delta", () => {
  assert.equal(classifyBurn(2025, new Date(2027, 0, 1)).springsSince, 2);
});

test("carries a label, legend note, hex color and bounded opacity", () => {
  const c = classifyBurn(2026, new Date(2027, 5, 1));
  assert.ok(c.label.length > 0);
  assert.ok(c.legend.length > 0);
  assert.match(c.color, /^#[0-9a-f]{6}$/i);
  assert.ok(c.fillOpacity > 0 && c.fillOpacity <= 1);
});
