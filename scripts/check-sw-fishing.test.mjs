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

test("out/sw.js precaches self-hosted map glyphs", (t) => {
  if (!existsSync(swPath)) return t.skip("out/sw.js not built (run npm run build)");
  const sw = readFileSync(swPath, "utf8");
  assert.ok(sw.includes("/fonts/glyphs/Open%20Sans%20Semibold/0-255.pbf"));
});

// Every query param the app puts on a same-origin navigation link must be ignored by the precache
// lookup, or the page misses the precache offline and falls through to /~offline.
const NAV_PARAMS = ["w", "spot", "on", "lat", "lon", "find"];

test("ignoreURLParametersMatching covers every app navigation param", () => {
  const m = src.match(/ignoreURLParametersMatching:\s*\[([^\]]*)\]/);
  assert.ok(m, "sw/index.ts sets ignoreURLParametersMatching");
  const patterns = [...m[1].matchAll(/\/((?:\\\/|[^/])+)\/([a-z]*)/g)].map(([, body, flags]) => new RegExp(body, flags));
  for (const p of NAV_PARAMS) assert.ok(patterns.some((re) => re.test(p)), `param "${p}" is ignored`);
  assert.ok(patterns.some((re) => re.test("utm_source")) && patterns.some((re) => re.test("fbclid")));
});

test("no same-origin link uses a query param the service worker doesn't ignore", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|mjs)$/.test(f)) files.push(p);
    }
  };
  for (const d of ["app", "components", "lib"]) walk(path.join(ROOT, d));
  const seen = new Set();
  // href="/x?a=…", href={`/x?a=${…}&b=${…}`}, push("/x?a=…"), searchParams.set("a", …)
  const linkRe = /(?:href=\{?|push\(|replace\(|href:\s*)[`"'](\/[^`"'\s]*\?[^`"'\s]*)/g;
  for (const f of files) {
    if (f.includes(`${path.sep}engine${path.sep}`) || f.includes(`${path.sep}catalog${path.sep}`)) continue;
    const text = readFileSync(f, "utf8");
    for (const [, url] of text.matchAll(linkRe)) {
      for (const [, k] of url.slice(url.indexOf("?")).matchAll(/[?&]([a-zA-Z_]+)=/g)) seen.add(k);
    }
    for (const [, k] of text.matchAll(/searchParams\.set\(\s*["']([a-zA-Z_]+)["']/g)) seen.add(k);
  }
  for (const k of ["w", "spot", "lat", "lon", "find"]) assert.ok(seen.has(k), `scan finds the known "${k}" link param`);
  for (const k of seen) assert.ok(NAV_PARAMS.includes(k), `link param "${k}" must be in ignoreURLParametersMatching`);
});

test("burns.geojson is runtime-cached for offline (foray-data, same-origin)", () => {
  const i = src.indexOf('cacheName: "foray-data"');
  assert.ok(i > 0);
  const m = src.slice(src.lastIndexOf("matcher:", i), i);
  assert.match(m, /sameOrigin/);
  assert.match(m, /\/data\/burns\.geojson/);
});

test("forest-type (LANDFIRE) and water (USGS hydro) overlay hosts are runtime-cached", () => {
  const i = src.indexOf('cacheName: "foray-forest"');
  assert.match(src.slice(src.lastIndexOf("matcher:", i), i), /edcintl\.cr\.usgs\.gov/);
  const j = src.indexOf('cacheName: "foray-basemap"');
  assert.match(src.slice(src.lastIndexOf("matcher:", j), j), /basemap\.nationalmap\.gov/);
  const layers = readFileSync(path.join(ROOT, "components/field-map/layers.ts"), "utf8");
  assert.match(layers, /https:\/\/edcintl\.cr\.usgs\.gov\/geoserver\/landfire\/wms/);
  assert.match(layers, /https:\/\/basemap\.nationalmap\.gov\/arcgis\/rest\/services\/USGSHydroCached/);
});

test("query-string links use DocLink (full navigation), never next/link", async () => {
  // Offline, next/link reuses a failed prefetch of the bare path and drops the query (lands on "/").
  const { readdirSync, statSync } = await import("node:fs");
  const bad = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(f)) {
        for (const m of readFileSync(p, "utf8").matchAll(/<Link\b[^>]*href=\{?[^>]*?[`"']\/[^`"'\s]*\?[a-zA-Z_]+=/g)) bad.push(`${path.relative(ROOT, p)}: ${m[0].slice(0, 80)}`);
      }
    }
  };
  for (const d of ["app", "components"]) walk(path.join(ROOT, d));
  assert.deepEqual(bad, []);
});

test("Forage Finder: LANDFIRE GetFeatureInfo is NetworkFirst with a short expiry, ahead of foray-forest", () => {
  const i = src.indexOf('cacheName: "foray-landcover"');
  assert.ok(i > 0, "sw/index.ts declares foray-landcover");
  const m = src.slice(src.lastIndexOf("matcher:", i), i);
  assert.match(m, /edcintl\.cr\.usgs\.gov/);
  assert.match(m, /GetFeatureInfo/);
  assert.match(m, /new NetworkFirst/);
  assert.ok(i < src.indexOf('cacheName: "foray-forest"'), "must precede the CacheFirst forest-tile matcher");
  assert.match(block("foray-landcover"), /maxAgeSeconds: 60 \* 60 \* 24 \* 7/);
  const finder = readFileSync(path.join(ROOT, "lib/forage-find/landcover.ts"), "utf8");
  assert.match(finder, /https:\/\/edcintl\.cr\.usgs\.gov\/geoserver\/landfire\/wms/);
  assert.match(finder, /GetFeatureInfo/);
});

test("Forage Finder sources are runtime-cached: Open-Meteo and terrarium tiles", () => {
  const cond = readFileSync(path.join(ROOT, "lib/forage-find/conditions.ts"), "utf8");
  assert.match(cond, /api\.open-meteo\.com/);
  const terr = readFileSync(path.join(ROOT, "lib/forage-find/terrain.ts"), "utf8");
  assert.match(terr, /s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium/);
  assert.ok(src.includes('url.hostname === "api.open-meteo.com"'));
});
