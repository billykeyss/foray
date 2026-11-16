process.env.TZ = "America/Los_Angeles";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { searchWaters } from "../lib/fishing/search.ts";
import { TOOL_SCHEMAS, executeTool } from "../lib/chat/tools.ts";
import { buildSystemPrompt } from "../lib/chat/prompt.ts";

const loadWater = async (slug) => {
  const p = `public/fishing/w/${slug}.json`;
  if (!fs.existsSync(p)) throw new Error(`Unknown water "${slug}"`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
};
const stocking = JSON.parse(fs.readFileSync("public/fishing/stocking-recent.json", "utf8"));
const loadStocking = async () => stocking;
const ctx = { lat: 39.33, lon: -120.18, locationLabel: "Truckee", regionId: "sierra-nevada", loadWater, loadStocking };
const noLoc = { ...ctx, lat: null, lon: null };

test("searchWaters: donner first, case-insensitive, prefix before substring", () => {
  assert.equal(searchWaters("donner")[0].slug, "donner-lake");
  assert.equal(searchWaters("DONNER")[0].slug, "donner-lake");
  const r = searchWaters("lake", 50);
  assert.ok(r.length > 1);
  const firstSub = r.findIndex((w) => !w.name.toLowerCase().startsWith("lake"));
  const lastPre = r.map((w) => w.name.toLowerCase().startsWith("lake")).lastIndexOf(true);
  assert.ok(firstSub === -1 || lastPre < firstSub);
  assert.equal(searchWaters("don", 3).length, 3);
  assert.deepEqual(searchWaters(""), []);
});

test("searchWaters matches species after names", () => {
  const r = searchWaters("golden trout", 5);
  assert.ok(r.some((w) => w.species.includes("Golden trout")));
});

test("schemas include the three fishing tools", () => {
  const names = TOOL_SCHEMAS.map((t) => t.name);
  for (const n of ["find_waters", "get_water_rules", "recent_stocking"]) assert.ok(names.includes(n), n);
});

test("get_water_rules: Little Truckee is catch & release on 2026-07-01, with citations", async () => {
  const out = await executeTool("get_water_rules", { slug: "little-truckee-river", date: "2026-07-01" }, ctx, () => {});
  const j = JSON.parse(out);
  assert.ok(j.scopes.some((s) => s.status === "catch_and_release"));
  assert.match(j.disclaimer, /not legal advice/i);
  assert.ok(j.dataAsOf);
  assert.equal(j.asOf, "2026-07-01");
  const rule = j.scopes.flatMap((s) => s.rules)[0];
  assert.ok("citation" in rule && "sourceUrl" in rule && "confidence" in rule);
  assert.ok(out.length <= 8000 + 20);
});

test("get_water_rules: unknown slug and invalid date return error strings", async () => {
  const a = await executeTool("get_water_rules", { slug: "nope-lake" }, ctx, () => {});
  assert.match(a, /nope-lake/);
  assert.match(a, /find_waters/);
  const b = await executeTool("get_water_rules", { slug: "donner-lake", date: "2026-13-45" }, ctx, () => {});
  assert.match(b, /date/i);
});

test("find_waters: query, near, and near without location", async () => {
  const q = JSON.parse(await executeTool("find_waters", { query: "donner" }, ctx, () => {}));
  assert.equal(q[0].slug, "donner-lake");
  const n = JSON.parse(await executeTool("find_waters", { near: true, limit: 5 }, ctx, () => {}));
  assert.ok(n.length > 0 && typeof n[0].distanceMi === "number");
  const e = await executeTool("find_waters", { near: true }, noLoc, () => {});
  assert.match(e, /location/i);
});

test("recent_stocking: filters by slug, default limit 10", async () => {
  const all = JSON.parse(await executeTool("recent_stocking", {}, ctx, () => {}));
  assert.equal(all.length, 10);
  const one = JSON.parse(await executeTool("recent_stocking", { slug: stocking[0].slug, limit: 2 }, ctx, () => {}));
  assert.ok(one.length >= 1 && one.every((e) => e.slug === stocking[0].slug));
});

test("system prompt mentions fishing tools and not legal advice", () => {
  const { staticText } = buildSystemPrompt({ todayISO: "2026-07-01", regionLabel: "x", locationLabel: "x", lat: null, lon: null });
  assert.match(staticText, /get_water_rules/);
  assert.match(staticText, /not legal advice/i);
});
