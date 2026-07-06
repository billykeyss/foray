import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlant, suggestPlants, MONTHLY_NORMAL_C } from "../lib/plant-season.ts";
import { PLANT_CATALOG } from "../lib/plant-catalog.ts";
import { REGIONS } from "../lib/regions.ts";

const nettle = PLANT_CATALOG.find((p) => p.id === "stinging-nettle"); // harvest [4,5,6,7], peak [5,6]
const SIERRA = REGIONS.find((r) => r.id === "sierra-nevada").terms;
const PNW = REGIONS.find((r) => r.id === "pacific-northwest").terms;

const env = (year, monthIdx0, weather = []) => ({
  weather,
  now: new Date(year, monthIdx0, 15),
  lat: 39.3,
  lon: -120.2,
});
const warm = (n, t) =>
  Array.from({ length: n }, () => ({
    time: "x", tempMax: t + 4, tempMin: t - 4, tempMean: t,
    precipitation: 0, windSpeed: 3, humidity: 50, pressure: 1015,
  }));

// ── scorePlant ────────────────────────────────────────────────────────────
test("out-of-season month scores 0 and inSeason false", () => {
  const r = scorePlant(nettle, env(2026, 0)); // January
  assert.equal(r.inSeason, false);
  assert.equal(r.score, 0);
});

test("peak month outscores a shoulder month (neutral weather)", () => {
  const may = scorePlant(nettle, env(2026, 4)); // May = peak
  const apr = scorePlant(nettle, env(2026, 3)); // April = shoulder
  assert.equal(may.peak, true);
  assert.equal(apr.peak, false);
  assert.ok(may.score > apr.score, `${may.score} !> ${apr.score}`);
});

test("temp nudge is bounded to [-12, +15] on a shoulder month", () => {
  const hot = scorePlant(nettle, env(2026, 3, warm(7, 25))); // way above April normal (4)
  const cold = scorePlant(nettle, env(2026, 3, warm(7, -25)));
  assert.ok(hot.score <= 75 && hot.score >= 73, `hot=${hot.score}`); // base 60 + max 15
  assert.equal(cold.score, 48); // base 60 - max 12
});

test("temp-insensitive plant ignores weather", () => {
  const fake = { harvestMonths: [4], peakMonths: [], seasonCue: { tempSensitive: false, notes: null } };
  const r = scorePlant(fake, env(2026, 3, warm(7, 25)));
  assert.equal(r.score, 60); // shoulder base, no nudge
});

test("monthly normals table has 12 entries", () => {
  assert.equal(MONTHLY_NORMAL_C.length, 12);
});

// ── suggestPlants ─────────────────────────────────────────────────────────
test("warm early spring (April) surfaces early greens", () => {
  const items = suggestPlants(env(2026, 3, warm(7, 12)), SIERRA);
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes("stinging-nettle"), ids.join(","));
  assert.ok(ids.includes("miners-lettuce"), ids.join(","));
  assert.ok(!ids.includes("thimbleberry")); // berry, harvest [7,8,9] — not April
});

test("mid-winter (January) surfaces nothing", () => {
  assert.equal(suggestPlants(env(2026, 0, warm(7, -2)), SIERRA).length, 0);
});

test("region filter respected — no Sierra plant shows for a PNW selection", () => {
  const items = suggestPlants(env(2026, 8, warm(7, 12)), PNW); // Sept, peak for many
  assert.equal(items.length, 0);
});

test("never surfaces a deadly/toxic warning entry", () => {
  for (let m = 0; m < 12; m++) {
    for (const it of suggestPlants(env(2026, m, warm(7, 12)), SIERRA)) {
      assert.ok(!["deadly", "toxic", "inedible"].includes(it.item.edibility), `${it.id} @ month ${m + 1}`);
    }
  }
});

test("emits RankedItem shape with a plants deep link", () => {
  const [it] = suggestPlants(env(2026, 4, warm(7, 12)), SIERRA); // May
  assert.equal(it.kind, "plant");
  assert.ok(it.href.startsWith("/plants/"));
  assert.ok(it.score >= 0 && it.score <= 100);
  assert.ok(it.label.length > 0);
});
