import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreShellfish, suggestShellfish, oceanRegionCoverage } from "../lib/shellfish-season.ts";
import { OCEAN_CATALOG } from "../lib/ocean-catalog.ts";
import { REGIONS } from "../lib/regions.ts";

const razor = OCEAN_CATALOG.find((o) => o.id === "pacific-razor-clam"); // harv [1-5,10-12], peak [3,4,10,11], tide-dependent
const dungeness = OCEAN_CATALOG.find((o) => o.id === "dungeness-crab"); // bestTide null → tide-independent
const COAST = REGIONS.find((r) => r.id === "california-coast").terms;
const SIERRA = REGIONS.find((r) => r.id === "sierra-nevada").terms;

// Spring tide ≈ new/full moon; neap ≈ quarter.
const NEW_MOON = new Date("2024-01-11T11:57:00Z"); // spring
const FIRST_QUARTER = new Date("2024-01-18T03:53:00Z"); // neap
const envAt = (d) => ({ weather: [], now: d, lat: 38, lon: -123 });

test("out-of-season month scores 0", () => {
  const r = scoreShellfish(razor, envAt(new Date(2024, 6, 15))); // July — not in harvest
  assert.equal(r.inSeason, false);
  assert.equal(r.score, 0);
});

test("tide-dependent species score higher on a spring tide than a neap", () => {
  const spring = scoreShellfish(razor, envAt(NEW_MOON)); // Jan — in season
  const neap = scoreShellfish(razor, envAt(FIRST_QUARTER)); // Jan — in season
  assert.ok(spring.inSeason && neap.inSeason);
  assert.ok(spring.score > neap.score, `${spring.score} !> ${neap.score}`);
});

test("tide-independent species (trap-caught) ignores the moon", () => {
  const a = scoreShellfish(dungeness, envAt(NEW_MOON)); // Jan — in season, tide null
  const b = scoreShellfish(dungeness, envAt(FIRST_QUARTER));
  assert.equal(a.score, b.score);
});

test("every shellfish reading carries a biotoxin safety warning", () => {
  const r = scoreShellfish(razor, envAt(NEW_MOON));
  assert.ok(r.warn && /clos/i.test(r.warn), r.warn);
});

test("suggestShellfish surfaces in-region, in-season shellfish with the warn + href", () => {
  const items = suggestShellfish(envAt(NEW_MOON), COAST); // Jan, California coast
  assert.ok(items.length > 0);
  for (const it of items) {
    assert.equal(it.kind, "shellfish");
    assert.ok(it.warn && it.warn.length > 0, `${it.id} missing warn`);
    assert.ok(it.href.startsWith("/ocean/"));
    assert.ok(it.score >= 0 && it.score <= 100);
  }
});

test("never surfaces a biotoxin hazard entry", () => {
  const HAZARDS = new Set(["paralytic-shellfish-poisoning", "amnesic-shellfish-poisoning", "diarrhetic-shellfish-poisoning", "vibrio-shellfish-infection"]);
  for (let m = 0; m < 12; m++) {
    for (const it of suggestShellfish(envAt(new Date(2024, m, 12)), COAST)) {
      assert.ok(!HAZARDS.has(it.id), `${it.id} @ month ${m + 1}`);
    }
  }
});

test("no shellfish for an inland (Sierra) selection", () => {
  assert.equal(suggestShellfish(envAt(NEW_MOON), SIERRA).length, 0);
  assert.equal(oceanRegionCoverage(SIERRA), false);
  assert.equal(oceanRegionCoverage(COAST), true);
});
