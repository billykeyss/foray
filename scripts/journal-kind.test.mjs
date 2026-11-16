process.env.TZ = "America/Los_Angeles";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { entryKind } from "../lib/journal.ts";
import { catchWarnings, checkCatch } from "../lib/fishing/catch-check.ts";
import { parseSpots, defaultSpotKind } from "../lib/saved-spots.ts";

const load = (slug) => JSON.parse(fs.readFileSync(`public/fishing/w/${slug}.json`, "utf8"));
const rule = (species, detail, extra = {}) => ({
  ruleType: "size_limit", summary: "", detail, citation: "14 CCR §5.00", sourceUrl: "https://example.org/r",
  polarity: "applies", confidence: "medium", appliesTo: "any", species, ...extra,
});

test("legacy entries without kind read as find; stored data is not rewritten", () => {
  const legacy = { id: "e-1", date: "2026-10-01", species: "Chanterelle", location: "x", notes: "" };
  const before = JSON.stringify(legacy);
  assert.equal(entryKind(legacy), "find");
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(entryKind({ ...legacy, kind: "catch" }), "catch");
});

test("size warning: under the minimum when kept", () => {
  const rules = [rule(["Black bass"], { min_length_in: 12 })];
  const w = catchWarnings({ species: "Smallmouth bass", length_in: 10, kept: true }, rules);
  assert.equal(w.length, 1);
  assert.equal(w[0].text, "Under the 12 in minimum here");
  assert.equal(w[0].citation, "14 CCR §5.00");
  assert.equal(w[0].sourceUrl, "https://example.org/r");
});

test("no warning when released, long enough, other species, or no length", () => {
  const rules = [rule(["Black bass"], { min_length_in: 12 })];
  assert.deepEqual(catchWarnings({ species: "Smallmouth bass", length_in: 10, kept: false }, rules), []);
  assert.deepEqual(catchWarnings({ species: "Smallmouth bass", length_in: 12, kept: true }, rules), []);
  assert.deepEqual(catchWarnings({ species: "Rainbow trout", length_in: 5, kept: true }, rules), []);
  assert.deepEqual(catchWarnings({ species: "Smallmouth bass", kept: true }, rules), []);
});

test("rules with no species apply to all; maximum length warns", () => {
  assert.equal(catchWarnings({ species: "Brown trout", length_in: 8, kept: true }, [rule([], { min_length_in: 10 })]).length, 1);
  const w = catchWarnings({ species: "Brown trout", length_in: 22, kept: true }, [rule(["trout"], { max_length_in: 20 })]);
  assert.equal(w[0].text, "Over the 20 in maximum here");
});

test("status warnings for kept fish at C&R or closed waters", () => {
  const c = { species: "Brown trout", length_in: 14, kept: true };
  assert.equal(catchWarnings(c, [], "catch_and_release")[0].text, "This water is catch & release only today");
  assert.equal(catchWarnings(c, [], "closed")[0].text, "This water is closed today");
  assert.deepEqual(catchWarnings({ ...c, kept: false }, [], "closed"), []);
  assert.deepEqual(catchWarnings(c, [], "open"), []);
});

test("checkCatch resolves a real dataset for the catch date (Donner Lake black bass 12 in)", () => {
  const ds = load("donner-lake");
  const bad = checkCatch(ds, { species: "Smallmouth bass", length_in: 10, kept: true }, "2026-07-10");
  assert.ok(bad.warnings.some((w) => w.text === "Under the 12 in minimum here"));
  assert.ok(bad.dataAsOf);
  const ok = checkCatch(ds, { species: "Smallmouth bass", length_in: 14, kept: true }, "2026-07-10");
  assert.ok(!ok.warnings.some((w) => /minimum/.test(w.text)));
});

test("saved spots: parse tolerates junk, default kind follows nearby water", () => {
  assert.deepEqual(parseSpots("nope"), []);
  assert.deepEqual(parseSpots(JSON.stringify([{ id: "a", lon: -120, lat: 39, label: "L", kind: "both", createdAt: "t" }, { bad: 1 }])).map((s) => s.id), ["a"]);
  assert.equal(defaultSpotKind(39.3228, -120.2644), "fish"); // on Donner Lake
  assert.equal(defaultSpotKind(39.0, -121.9), "both");
});
