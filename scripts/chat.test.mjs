import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSystemPrompt,
  SAFETY_DISCLAIMER,
  WEB_PREFIX,
} from "../lib/chat/prompt.ts";

test("static prompt carries the safety disclaimer verbatim", () => {
  const { staticText } = buildSystemPrompt({
    todayISO: "2026-07-05",
    regionLabel: "Sierra Nevada & Great Basin",
    locationLabel: "Tahoe Meadows",
    lat: 39.312,
    lon: -119.896,
  });
  assert.ok(staticText.includes(SAFETY_DISCLAIMER));
  assert.ok(staticText.includes(WEB_PREFIX));
  assert.ok(staticText.includes("[[species:"));
  // safety rules
  assert.match(staticText, /never confirm .* safe to eat/i);
  assert.match(staticText, /spore print/i);
});

test("dynamic prompt carries context, static prompt does not", () => {
  const ctx = {
    todayISO: "2026-07-05",
    regionLabel: "California Coast",
    locationLabel: "Mendocino",
    lat: 39.3,
    lon: -123.8,
  };
  const { staticText, dynamicText } = buildSystemPrompt(ctx);
  assert.ok(dynamicText.includes("2026-07-05"));
  assert.ok(dynamicText.includes("California Coast"));
  assert.ok(dynamicText.includes("Mendocino"));
  // static block must stay byte-stable across contexts (prompt caching)
  const again = buildSystemPrompt({ ...ctx, todayISO: "2027-01-01", regionLabel: "X", locationLabel: "Y" });
  assert.equal(staticText, again.staticText);
});

test("dynamic prompt formats coordinates and handles missing location", () => {
  const withLoc = buildSystemPrompt({
    todayISO: "2026-07-05",
    regionLabel: "R",
    locationLabel: "Tahoe Meadows",
    lat: 39.312,
    lon: -119.896,
  });
  assert.ok(withLoc.dynamicText.includes("Tahoe Meadows (39.312, -119.896)"));
  const noLoc = buildSystemPrompt({
    todayISO: "2026-07-05",
    regionLabel: "R",
    locationLabel: "",
    lat: null,
    lon: null,
  });
  assert.ok(noLoc.dynamicText.includes("User location: not set"));
});
