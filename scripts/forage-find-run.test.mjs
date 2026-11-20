import test from "node:test";
import assert from "node:assert/strict";
import { PNW_CATALOG } from "../lib/species-catalog.ts";
import { findableProfiles } from "../lib/forage-find/profiles.ts";
import { findForageSpots } from "../lib/forage-find/run.ts";
import { haversineKm, lonLatToTilePixel } from "../lib/forage-find/geo.ts";

const PROFILES = findableProfiles(PNW_CATALOG);
const P = (id) => PROFILES.find((p) => p.id === id);
const CENTER = { lat: 39.33, lon: -120.18, label: "Truckee" };

// Synthetic terrarium tiles: elevation rises 0.05 m/m eastward from 1800 m with N-S ridges/valleys.
function tileFor(z, x, y) {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  const n = 2 ** z;
  for (let py = 0; py < 256; py++)
    for (let px = 0; px < 256; px++) {
      const lon = ((x + px / 256) / n) * 360 - 180;
      const e = 1800 + Math.round(200 * Math.sin(lon * 400)) + Math.round((lon + 120.18) * 4000);
      const v = e + 32768;
      const i = (py * 256 + px) * 4;
      data[i] = Math.floor(v / 256);
      data[i + 1] = v % 256;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  return { width: 256, height: 256, data };
}

const DAYS = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"];
function omLoc(soilT = 11) {
  return {
    elevation: 1900,
    daily: {
      time: DAYS,
      precipitation_sum: DAYS.map(() => 5),
      relative_humidity_2m_mean: DAYS.map(() => 75),
      temperature_2m_max: DAYS.map(() => 18),
      temperature_2m_min: DAYS.map(() => 4),
    },
    hourly: {
      time: DAYS.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`)),
      soil_moisture_3_to_9cm: DAYS.flatMap(() => Array(24).fill(0.26)),
      soil_temperature_6cm: DAYS.flatMap(() => Array(24).fill(soilT)),
    },
  };
}

function deps({ evtFails = false, wxFails = false, calls = [] } = {}) {
  return {
    fetchJson: async (url) => {
      const u = new URL(url);
      calls.push(u.hostname);
      if (u.hostname === "api.open-meteo.com") {
        if (wxFails) return { ok: false, status: 500, json: async () => ({}) };
        const n = u.searchParams.get("latitude").split(",").length;
        return { ok: true, json: async () => (n === 1 ? omLoc() : Array.from({ length: n }, () => omLoc())) };
      }
      if (u.hostname === "edcintl.cr.usgs.gov") {
        if (evtFails) throw new Error("network");
        return { ok: true, json: async () => ({ features: [{ properties: { GRAY_INDEX: 7053 } }] }) }; // ponderosa
      }
      throw new Error(`unexpected ${url}`);
    },
    fetchTile: async (z, x, y) => tileFor(z, x, y),
    loadBurns: async () => ({ type: "FeatureCollection", features: [] }),
  };
}

test("in season: up to 5 ranked, spaced, labelled spots with reasons and progress", async () => {
  const steps = [];
  const r = await findForageSpots({
    profile: P("boletus-barrowsii"),
    allProfiles: PROFILES,
    center: CENTER,
    radiusKm: 15,
    today: "2026-09-14",
    deps: deps(),
    onProgress: (s) => steps.push(s),
    gridTarget: 24,
  });
  assert.deepEqual(steps, ["weather", "terrain", "trees", "done"]);
  assert.equal(r.status, "ok", r.message);
  assert.ok(r.spots.length >= 1 && r.spots.length <= 5);
  for (let i = 1; i < r.spots.length; i++) {
    assert.ok(r.spots[i - 1].score >= r.spots[i].score);
    for (let j = 0; j < i; j++) assert.ok(haversineKm(r.spots[i], r.spots[j]) >= 2);
  }
  for (const s of r.spots) {
    assert.ok(haversineKm(CENTER, s) <= 15.6);
    assert.ok(s.label.length > 0);
    assert.ok(s.reasons.some((x) => x.good));
    assert.equal(s.cover, "Northern Rocky Mountain Ponderosa Pine Woodland and Savanna");
  }
  assert.deepEqual(r.spots.map((s) => s.rank), r.spots.map((_, i) => i + 1));
  assert.equal(r.conditions.soilTempC, 11);
  assert.equal(r.cautions[0], "Check land status and fire closures; verify ID before eating.");
  assert.deepEqual(r.notes, []);
});

test("out of season: no network, honest message and in-season suggestions", async () => {
  const calls = [];
  const r = await findForageSpots({
    profile: P("morchella-tomentosa"),
    allProfiles: PROFILES,
    center: CENTER,
    today: "2026-11-20",
    deps: { ...deps({ calls }), fetchTile: async () => assert.fail("no tiles"), loadBurns: async () => assert.fail("no burns") },
  });
  assert.equal(r.status, "out-of-season");
  assert.equal(calls.length, 0);
  assert.equal(r.spots.length, 0);
  assert.match(r.message, /Apr–Aug/);
  assert.ok(r.inSeasonNow.length > 0);
  assert.ok(!r.inSeasonNow.some((s) => s.id === "morchella-tomentosa"));
});

test("degrades per source: tree lookup and weather failures are noted, spots still returned", async () => {
  const noTrees = await findForageSpots({
    profile: P("boletus-barrowsii"), allProfiles: PROFILES, center: CENTER, radiusKm: 15, today: "2026-09-14",
    deps: deps({ evtFails: true }), gridTarget: 12,
  });
  assert.ok(noTrees.spots.length > 0);
  assert.ok(noTrees.notes.some((n) => /Tree cover unavailable/.test(n)));
  assert.ok(noTrees.spots.every((s) => s.cover === null));

  const noWx = await findForageSpots({
    profile: P("boletus-barrowsii"), allProfiles: PROFILES, center: CENTER, radiusKm: 15, today: "2026-09-14",
    deps: deps({ wxFails: true }), gridTarget: 12,
  });
  assert.ok(noWx.spots.length > 0);
  assert.ok(noWx.notes.some((n) => /Weather unavailable/.test(n)));
  assert.equal(noWx.conditions, null);
});

test("burn-loving species gets burn-interior candidates and a burn reason", async () => {
  // A 2025 fire just east of the centre.
  const d = 0.03, lon = -120.1, lat = 39.33;
  const ring = [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]];
  const r = await findForageSpots({
    profile: P("morchella-tomentosa"), allProfiles: PROFILES, center: CENTER, radiusKm: 15, today: "2026-05-20",
    deps: { ...deps(), loadBurns: async () => ({ features: [{ properties: { name: "Test", year: 2025 }, geometry: { type: "Polygon", coordinates: [ring] } }] }) },
    gridTarget: 12,
  });
  assert.ok(r.spots.length > 0);
  assert.ok(r.spots[0].burn, "the top spot is inside the burn");
  assert.ok(r.spots[0].reasons.some((x) => x.text === "Burned 2025 · Test"));
});

test("cancel aborts with an AbortError", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    findForageSpots({ profile: P("boletus-barrowsii"), allProfiles: PROFILES, center: CENTER, today: "2026-09-14", deps: deps(), signal: ac.signal }),
    (e) => e.name === "AbortError",
  );
  assert.equal(typeof lonLatToTilePixel, "function");
});
