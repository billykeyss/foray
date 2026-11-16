process.env.TZ = "America/Los_Angeles";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveDataset, STAMP } from "../lib/fishing/resolve.ts";
import { localIsoDate } from "../lib/fishing/local-date.ts";
import { nearestWaters } from "../lib/fishing/nearby.ts";

const goldens = JSON.parse(fs.readFileSync("scripts/fixtures/keeper-goldens.json", "utf8"));
const load = (slug) => JSON.parse(fs.readFileSync(`public/fishing/w/${slug}.json`, "utf8"));

test("matches every Keeper golden", () => {
  assert.equal(goldens.cases.length, 164);
  for (const g of goldens.cases) {
    const r = resolveDataset(load(g.slug), g.on);
    const id = `${g.slug} ${g.on}`;
    assert.equal(r.status.overall, g.overall, id);
    assert.deepEqual(r.scopes.map((s) => [s.scope, s.status]), g.scopes.map((s) => [s.scope, s.status]), id);
    assert.equal(r.licenses.length, g.licenseCount, id);
    assert.equal(r.asOf, g.on);
  }
});

test("resolveDataset carries dataset passthrough fields", () => {
  const ds = load("donner-lake");
  const r = resolveDataset(ds, "2026-07-01");
  assert.equal(r.dataAsOf, ds.asOf);
  assert.equal(r.water.slug, "donner-lake");
  assert.deepEqual(r.stocking, ds.stocking);
});

test("STAMP maps every status", () => {
  assert.deepEqual(STAMP, { open: "OPEN", catch_and_release: "C&R", closed: "CLOSED", unknown: "CHECK" });
});

test("localIsoDate uses local time", () => {
  assert.equal(localIsoDate(new Date("2026-11-16T03:00:00Z")), "2026-11-15");
  assert.match(localIsoDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test("nearestWaters from Truckee finds Donner Lake within 5 miles (11th nearest of many nearby creeks)", () => {
  const r = nearestWaters(39.33, -120.18, 15);
  assert.ok(r.length <= 15);
  const donner = r.find((w) => w.slug === "donner-lake");
  assert.ok(donner && donner.distanceMi < 5);
  assert.equal(nearestWaters(39.33, -120.18, 3).length, 3);
  assert.equal(nearestWaters(39.33, -120.18, 15, 2).every((w) => w.distanceMi <= 2), true);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].distanceMi >= r[i - 1].distanceMi);
  assert.ok(r.every((w) => w.distanceMi <= 50));
});

test("nearestWaters from Seattle returns []", () => {
  assert.deepEqual(nearestWaters(47.61, -122.33, 5), []);
});
