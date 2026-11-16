// Keeper's web/src/ruleFormat.ts has no tests of its own, so these cover the four rule kinds named
// in the brief with real parameter shapes taken from public/fishing/w/*.json.
import test from "node:test";
import assert from "node:assert/strict";
import { formatRule, groupBagAndSize, ruleTypeLabel } from "../components/fishing/rule-format.ts";

const base = { summary: "", citation: null, sourceUrl: null, polarity: "asserts", confidence: "high", appliesTo: "water", species: [] };
const rule = (ruleType, detail, extra = {}) => ({ ...base, ruleType, detail, ...extra });

test("bag: daily and possession", () => {
  const r = formatRule(rule("bag", { aggregation: "combined_group", daily: 5, possession: 10, unit: "fish" }));
  assert.deepEqual(r, { title: "Bag limit", lines: ["5 per day", "Possession 10"] });
});

test("bag: catch and release with zero daily", () => {
  const r = formatRule(rule("bag", { aggregation: "combined_group", catch_and_release: true, daily: 0, possession: 0, unit: "fish" }));
  assert.equal(r.title, "Bag limit");
  assert.deepEqual(r.lines, ["Catch & release only", "Possession 0"]);
});

test("size_limit: minimum, slot and maximum", () => {
  assert.deepEqual(formatRule(rule("size_limit", { min_length_in: 14, measurement: "total", unit: "in" })).lines, ["14″+ minimum length"]);
  assert.deepEqual(formatRule(rule("size_limit", { max_length_in: 12, measurement: "total", unit: "in" })).lines, ["≤12″ maximum length"]);
  assert.deepEqual(
    formatRule(rule("size_limit", { min_length_in: 15, protected_slot: { min_in: 18, max_in: 22 }, unit: "in" })).lines,
    ["15–18″ keep slot (inches)"],
  );
  assert.equal(formatRule(rule("size_limit", { note: "none" })).title, "Size limit");
});

test("gear_method: barbless artificial single hook", () => {
  const r = formatRule(
    rule("gear_method", { artificial_only: true, bait_allowed: false, barbless_required: true, flies_only: false, lures_allowed: true, single_hook_required: false, max_rods: 2 }),
  );
  assert.deepEqual(r, { title: "Gear & method", lines: ["No bait", "Artificial only", "Barbless", "≤ 2 rods"] });
});

test("fishing_hours: window and basis-only", () => {
  assert.deepEqual(formatRule(rule("fishing_hours", { allowed_from: "5:00 AM", allowed_to: "10:00 PM", basis: "clock" })), {
    title: "Fishing hours",
    lines: ["5:00 AM – 10:00 PM"],
  });
  assert.deepEqual(formatRule(rule("fishing_hours", { basis: "sunrise_sunset" })).lines, []);
});

test("asserts_none produces a none-on-record line and unknown types get a readable title", () => {
  assert.deepEqual(formatRule(rule("closure", {}, { polarity: "asserts_none" })), { title: "No closure", lines: ["None on record"] });
  assert.equal(ruleTypeLabel("some_new_type"), "some new type");
});

test("groupBagAndSize merges exactly one bag + one size per species only", () => {
  const bag = rule("bag", { daily: 5 }, { species: ["Kokanee"] });
  const size = rule("size_limit", { min_length_in: 10 }, { species: ["Kokanee"] });
  const other = rule("season", {});
  const g = groupBagAndSize([bag, other, size]);
  assert.equal(g.length, 2);
  assert.equal(g[0].kind, "merged");
  const bag2 = rule("bag", { daily: 2 }, { species: ["Kokanee"] });
  assert.equal(groupBagAndSize([bag, bag2, size]).every((i) => i.kind === "single"), true);
});
