import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRY } from "../lib/forecast/registry.ts";
import { REGIONS } from "../lib/regions.ts";

const SIERRA = REGIONS.find((r) => r.id === "sierra-nevada").terms;
const warm = (n, t) =>
  Array.from({ length: n }, () => ({
    time: "x", tempMax: t + 4, tempMin: t - 4, tempMean: t,
    precipitation: 0, windSpeed: 3, humidity: 50, pressure: 1015,
  }));
const env = { weather: warm(7, 12), now: new Date(2026, 4, 15), lat: 39.3, lon: -120.2 };

test("registry has mushroom, plant and shellfish forecasters, in that order", () => {
  assert.deepEqual(REGISTRY.map((f) => f.kind), ["mushroom", "plant", "shellfish"]);
});

test("every forecaster carries a title, emptyState and suggest()", () => {
  for (const f of REGISTRY) {
    assert.ok(f.title.length > 0, f.kind);
    assert.ok(f.emptyState.length > 0, f.kind);
    assert.equal(typeof f.suggest, "function");
  }
});

test("suggest() emits well-formed RankedItems", () => {
  for (const f of REGISTRY) {
    for (const it of f.suggest(env, SIERRA)) {
      assert.equal(it.kind, f.kind);
      assert.ok(it.score >= 0 && it.score <= 100, `${it.id} score ${it.score}`);
      assert.ok(it.label.length > 0, it.id);
      assert.ok(it.href.startsWith("/"), it.href);
      assert.ok(it.item && typeof it.item.id === "string");
    }
  }
});
