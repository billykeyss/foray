import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const src = readFileSync(path.join(ROOT, "sw/index.ts"), "utf8");

// Grab the runtime-caching block that declares a given cacheName.
function block(cacheName) {
  const i = src.indexOf(`cacheName: "${cacheName}"`);
  assert.ok(i > 0, `sw/index.ts declares ${cacheName}`);
  return src.slice(i, i + 400);
}

for (const name of ["foray-imagery", "foray-terrain"]) {
  test(`${name} is CacheFirst with 4000 entries / 30 days`, () => {
    const start = src.lastIndexOf("handler:", src.indexOf(`cacheName: "${name}"`));
    assert.match(src.slice(start, start + 60), /new CacheFirst/);
    const b = block(name);
    assert.match(b, /maxEntries: 4000/);
    assert.match(b, /maxAgeSeconds: 60 \* 60 \* 24 \* 30/);
  });
}

test("imagery and terrain hosts/paths", () => {
  assert.match(src, /server\.arcgisonline\.com/);
  assert.match(src, /World_Imagery/);
  assert.match(src, /elevation-tiles-prod/);
  assert.match(src, /s3\.amazonaws\.com/);
});

test("imagery matcher precedes basemap matcher", () => {
  const a = src.indexOf('cacheName: "foray-imagery"');
  assert.ok(a > 0 && a < src.indexOf('cacheName: "foray-basemap"'));
});

test("foray-forest covers NF and BLM hosts", () => {
  const i = src.indexOf('cacheName: "foray-forest"');
  const start = src.lastIndexOf("matcher:", i);
  const m = src.slice(start, i);
  assert.match(m, /apps\.fs\.usda\.gov/);
  assert.match(m, /gis\.blm\.gov/);
});

const swPath = path.join(ROOT, "out/sw.js");
test("out/sw.js precaches fishing data", (t) => {
  if (!existsSync(swPath)) return t.skip("out/sw.js not built (run npm run build)");
  const sw = readFileSync(swPath, "utf8");
  assert.ok(sw.includes("/fishing/w/donner-lake.json"));
  assert.ok(sw.includes("/fishing/stocking-recent.json"));
});
