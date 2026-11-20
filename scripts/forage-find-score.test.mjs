import test from "node:test";
import assert from "node:assert/strict";
import { PNW_CATALOG } from "../lib/species-catalog.ts";
import {
  buildProfile,
  findableProfiles,
  hostKeywords,
  isFindable,
  monthsText,
  seasonStatus,
  inSeasonNow,
  resolveFindTarget,
} from "../lib/forage-find/profiles.ts";
import { scoreSpot, FIND_CAUTION } from "../lib/forage-find/score.ts";
import { placeLabel } from "../lib/forage-find/places.ts";
import { buildOpenMeteoUrl, parseOpenMeteo, fetchConditions } from "../lib/forage-find/conditions.ts";
import { evtFeatureInfoUrl, parseEvtResponse, describeEvt, fetchEvt } from "../lib/forage-find/landcover.ts";
import { EVT_NAMES } from "../lib/forage-find/evt-names.ts";

const PROFILES = findableProfiles(PNW_CATALOG);
const byId = (id) => PROFILES.find((p) => p.id === id);

test("findable: choice/edible plus the headline overrides; never dangerous or Amanita", () => {
  assert.ok(PROFILES.length >= 40, `got ${PROFILES.length}`);
  for (const p of PROFILES) {
    assert.ok(!["toxic", "deadly", "psychoactive", "inedible", "medicinal-only"].includes(p.edibility), p.id);
    assert.ok(!p.scientific.startsWith("Amanita"), p.id);
    assert.ok(p.months.length > 0, p.id);
  }
  for (const id of ["morchella-tomentosa", "cantharellus-formosus", "boletus-edulis", "tricholoma-murrillianum", "hydnum-repandum", "hypomyces-lactifluorum", "pleurotus-populinus", "coprinus-comatus", "laetiporus-conifericola", "calvatia-booniana"])
    assert.ok(byId(id), `${id} is findable`);
  const deadly = PNW_CATALOG.find((s) => s.edibility === "deadly");
  assert.equal(isFindable(deadly), false);
  assert.equal(byId("gyromitra-esculenta"), undefined);
});

test("morel override: burn-loving, soil-temp window, cook-thoroughly caution", () => {
  const m = byId("morchella-tomentosa");
  assert.equal(m.burn, "prefers");
  assert.deepEqual(m.soilTempC, [7, 14]);
  assert.ok(m.cautions.some((c) => /cook/i.test(c)));
  assert.ok(m.cautions.some((c) => /false morel/i.test(c)));
});

test("hostKeywords maps host trees to LANDFIRE vocabulary", () => {
  const k = hostKeywords([{ common: "white fir", scientific: "Abies concolor" }, { common: "aspen", scientific: "Populus tremuloides" }]);
  assert.ok(k.includes("white fir") && k.includes("mixed conifer") && k.includes("aspen"));
  assert.ok(!k.includes("cottonwood"));
});

test("buildProfile derives defaults from the catalog record", () => {
  const s = PNW_CATALOG.find((x) => x.id === "boletus-barrowsii");
  const p = buildProfile(s);
  assert.deepEqual(p.months, s.fruitingMonths);
  assert.deepEqual(p.elevationM, s.elevationM);
  assert.ok(p.hosts.includes("ponderosa"));
  assert.equal(p.westRelevant, true);
});

test("monthsText and seasonStatus", () => {
  assert.equal(monthsText([4, 5, 6, 7, 8]), "Apr–Aug");
  assert.equal(monthsText([10, 11, 12, 1, 2, 3]), "Oct–Mar");
  assert.equal(monthsText([1, 2, 6, 7, 8, 10, 11, 12]), "Oct–Feb, Jun–Aug");
  assert.equal(monthsText([5]), "May");
  assert.equal(monthsText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "Year-round");
  const m = byId("morchella-tomentosa");
  assert.equal(seasonStatus(m, 11), "out");
  assert.equal(seasonStatus(m, 5), "peak");
  assert.equal(seasonStatus(m, 8), "in");
});

test("inSeasonNow lists findable species fruiting this month, peak and west-relevant first", () => {
  const list = inSeasonNow(PROFILES, 11, 6);
  assert.ok(list.length > 0 && list.length <= 6);
  for (const s of list) assert.ok(byId(s.id).months.includes(11));
  assert.ok(!list.some((s) => s.id.startsWith("morchella")));
});

test("resolveFindTarget: ids, common names, plurals and aliases", () => {
  assert.equal(resolveFindTarget("morels", PROFILES)?.id, "morchella-tomentosa");
  assert.equal(resolveFindTarget("Morel", PROFILES)?.id, "morchella-tomentosa");
  assert.equal(resolveFindTarget("boletus-edulis", PROFILES)?.id, "boletus-edulis");
  assert.equal(resolveFindTarget("porcini", PROFILES)?.id, "boletus-edulis");
  assert.equal(resolveFindTarget("hedgehog mushrooms", PROFILES)?.id, "hydnum-repandum");
  assert.equal(resolveFindTarget("Shaggy Mane", PROFILES)?.id, "coprinus-comatus");
  assert.equal(resolveFindTarget("death cap", PROFILES), null);
  assert.equal(resolveFindTarget("", PROFILES), null);
});

const WET = { rain7dMm: 40, humidityPct: 85, soilMoisture: 0.3, soilTempC: 10, maxTemp3dC: 14, elevationM: 2000 };
const FIR = describeEvt(7032); // red fir
const SAGE = describeEvt(7080); // big sagebrush

test("describeEvt reads the generated LANDFIRE table", () => {
  assert.ok(Object.keys(EVT_NAMES).length > 200);
  assert.equal(FIR.name, "Mediterranean California Red Fir Forest");
  assert.equal(FIR.lifeform, "Tree");
  assert.equal(describeEvt(-9999), null);
  assert.match(describeEvt(1).name, /Vegetation type 1/);
});

test("scoreSpot: a prime morel spot beats the same spot unburned; reasons explain why", () => {
  const m = byId("morchella-tomentosa");
  const base = { lat: 39.3, lon: -120.2, terrain: { elevationM: 2000, slopeDeg: 8, aspect: "N", tpiM: -12 }, cond: WET, evt: FIR };
  const burned = scoreSpot(m, 5, { ...base, burn: { name: "Caldor", year: 2025, ageYears: 1 } });
  const unburned = scoreSpot(m, 5, { ...base, burn: null });
  assert.ok(burned.score > unburned.score + 10, `${burned.score} vs ${unburned.score}`);
  assert.ok(burned.score >= 70 && burned.score <= 100);
  const texts = burned.reasons.filter((r) => r.good).map((r) => r.text);
  assert.ok(texts.includes("Burned 2025 · Caldor"), texts.join(" | "));
  assert.ok(texts.includes("Drainage bottom"));
  assert.ok(texts.some((t) => /Red Fir/.test(t)));
  assert.ok(texts.includes("40 mm rain past 7 d"));
  assert.ok(texts.includes("Soil 10 °C"));
  // Ordered by contribution, good ones first.
  const firstBad = burned.reasons.findIndex((r) => !r.good);
  assert.ok(firstBad === -1 || burned.reasons.slice(firstBad).every((r) => !r.good));
  assert.ok(burned.cautions.some((c) => /cook/i.test(c)));
});

test("scoreSpot: frozen ground is a heavy penalty with a plain reason", () => {
  const b = byId("boletus-barrowsii");
  const ok = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: { elevationM: 2000, slopeDeg: 5, aspect: "E", tpiM: 0 }, cond: WET, evt: FIR, burn: null });
  const frozen = scoreSpot(b, 9, {
    lat: 0, lon: 0, terrain: { elevationM: 2000, slopeDeg: 5, aspect: "E", tpiM: 0 },
    cond: { ...WET, soilTempC: 0.5, maxTemp3dC: 1 }, evt: FIR, burn: null,
  });
  assert.ok(frozen.score < ok.score * 0.5, `${frozen.score} vs ${ok.score}`);
  assert.ok(frozen.reasons.some((r) => !r.good && /frozen|snow/i.test(r.text)));
});

test("scoreSpot: host trees matter; sagebrush is a poor king-bolete spot", () => {
  const b = byId("boletus-barrowsii");
  const t = { elevationM: 2000, slopeDeg: 5, aspect: "E", tpiM: 0 };
  const pine = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: t, cond: WET, evt: describeEvt(7053), burn: null }); // ponderosa
  const sage = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: t, cond: WET, evt: SAGE, burn: null });
  assert.ok(pine.score > sage.score + 10);
  assert.ok(sage.reasons.some((r) => !r.good && /host/i.test(r.text)));
});

test("scoreSpot: missing sources are skipped, not counted as zero", () => {
  const b = byId("boletus-barrowsii");
  const t = { elevationM: 2000, slopeDeg: 5, aspect: "E", tpiM: 0 };
  const noTrees = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: t, cond: WET, evt: "unavailable", burn: null });
  const noWx = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: t, cond: null, evt: describeEvt(7053), burn: null }); // ponderosa: a host
  assert.ok(noTrees.score > 40);
  assert.ok(noWx.score > 40);
  assert.ok(!noTrees.reasons.some((r) => /host/i.test(r.text)));
});

test("scoreSpot: elevation outside the band lowers the score", () => {
  const b = byId("boletus-barrowsii"); // 1500-2700 m
  const at = (e) => scoreSpot(b, 9, { lat: 0, lon: 0, terrain: { elevationM: e, slopeDeg: 5, aspect: "E", tpiM: 0 }, cond: WET, evt: FIR, burn: null }).score;
  assert.ok(at(2000) > at(1000));
  assert.ok(at(1000) >= at(400));
});

test("FIND_CAUTION is the land-status / ID line", () => {
  assert.equal(FIND_CAUTION, "Check land status and fire closures; verify ID before eating.");
});

test("placeLabel: direction + distance from the nearest place", () => {
  assert.equal(placeLabel(39.328, -120.183), "At Truckee");
  const l = placeLabel(39.37, -120.12);
  assert.match(l, /^\d+ km (N|NE|E) of Truckee$/);
  assert.match(placeLabel(10, 10), /^10\.000, 10\.000$/);
});

test("Open-Meteo URL, parse and chunked fetch", async () => {
  const url = buildOpenMeteoUrl([{ lat: 39.33, lon: -120.18 }, { lat: 39.1, lon: -120 }]);
  assert.match(url, /latitude=39\.3300,39\.1000/);
  assert.match(url, /past_days=7/);
  assert.match(url, /soil_moisture_3_to_9cm/);
  const days = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
  const loc = (rain) => ({
    elevation: 1800,
    daily: {
      time: days,
      precipitation_sum: days.map(() => rain),
      relative_humidity_2m_mean: days.map(() => 80),
      temperature_2m_max: days.map((d, i) => i),
      temperature_2m_min: days.map(() => 0),
    },
    hourly: {
      time: days.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`)),
      soil_moisture_3_to_9cm: days.flatMap(() => Array(24).fill(0.2)),
      soil_temperature_6cm: days.flatMap((d, i) => Array(24).fill(i < 7 ? 5 : 50)),
    },
  });
  const c = parseOpenMeteo(loc(2), "2026-11-20");
  assert.equal(c.rain7dMm, 14); // 11-14 … 11-20
  assert.equal(c.humidityPct, 80);
  assert.equal(c.soilMoisture, 0.2);
  // 11-14..11-19 are 5 °C, 11-20 is 50 °C → mean 11.4
  assert.equal(c.soilTempC, 11.4);
  assert.equal(c.maxTemp3dC, 6); // mean of 11-18,19,20 maxima = 5,6,7
  assert.equal(c.elevationM, 1800);

  const pts = Array.from({ length: 60 }, (_, i) => ({ lat: 39 + i * 0.01, lon: -120 }));
  const calls = [];
  const fake = async (u) => {
    calls.push(u);
    const n = new URL(u).searchParams.get("latitude").split(",").length;
    const body = n === 1 ? loc(1) : Array.from({ length: n }, () => loc(1));
    return { ok: true, json: async () => body };
  };
  const out = await fetchConditions(pts, "2026-11-20", fake);
  assert.equal(calls.length, 2);
  assert.equal(out.length, 60);
  assert.equal(out[59].rain7dMm, 7);
  const one = await fetchConditions(pts.slice(0, 1), "2026-11-20", fake);
  assert.equal(one.length, 1);
});

test("LANDFIRE GetFeatureInfo URL and parse", async () => {
  const u = new URL(evtFeatureInfoUrl(39.3, -120.2));
  assert.equal(u.hostname, "edcintl.cr.usgs.gov");
  assert.equal(u.searchParams.get("request"), "GetFeatureInfo");
  assert.equal(u.searchParams.get("query_layers"), "LF2023_EVT_CONUS");
  assert.equal(u.searchParams.get("info_format"), "application/json");
  assert.equal(parseEvtResponse({ features: [{ properties: { GRAY_INDEX: 9336 } }] }), 9336);
  assert.equal(parseEvtResponse({ features: [] }), null);
  assert.equal(parseEvtResponse({ features: [{ properties: { GRAY_INDEX: -9999 } }] }), null);
  const evt = await fetchEvt(39.3, -120.2, async () => ({ ok: true, json: async () => ({ features: [{ properties: { GRAY_INDEX: 7032 } }] }) }));
  assert.equal(evt.code, 7032);
  await assert.rejects(fetchEvt(39.3, -120.2, async () => ({ ok: false, status: 503 })));
});

test("scoreSpot: LANDFIRE open water scores zero; developed land carries a private-property caution", () => {
  const b = byId("boletus-barrowsii");
  const t = { elevationM: 1900, slopeDeg: 5, aspect: "E", tpiM: 0 };
  const lake = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: t, cond: WET, evt: { code: 7292, name: "Open Water", lifeform: "Water", physiognomy: "Open Water", group: "Open Water", coverType: "Open Water" }, burn: null });
  assert.equal(lake.score, 0);
  const town = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: t, cond: WET, evt: describeEvt(7298), burn: null });
  assert.ok(town.cautions.some((c) => /private/i.test(c)));
  const flat = scoreSpot(b, 9, { lat: 0, lon: 0, terrain: { elevationM: 1900, slopeDeg: 0, aspect: null, tpiM: 0 }, cond: WET, burn: null });
  // Flat ground alone is a meadow, not a lake: only LANDFIRE water zeroes a spot.
  assert.ok(!flat.reasons.some((r) => /water/i.test(r.text)));
  assert.ok(flat.score > 0);
});

test("stored result: tolerant parse", async () => {
  const { parseStoredFind } = await import("../lib/forage-find/store.ts");
  assert.equal(parseStoredFind(null), null);
  assert.equal(parseStoredFind("{"), null);
  assert.equal(parseStoredFind(JSON.stringify({ version: 2 })), null);
  const ok = { version: 1, speciesId: "x", spots: [], at: "2026-11-20T10:00:00Z", center: { lat: 1, lon: 2, label: "" } };
  assert.deepEqual(parseStoredFind(JSON.stringify(ok)), ok);
});

test("generated EVT table: banner, CA/NV codes present, eastern systems absent", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/forage-find/evt-names.ts", import.meta.url), "utf8");
  assert.match(src, /^\/\/ AUTO-GENERATED by scripts\/build-evt-names\.mjs/);
  for (const c of [7027, 7032, 7080, 7011, 9336]) assert.ok(EVT_NAMES[c], `code ${c}`);
  assert.ok(!Object.values(EVT_NAMES).some(([n]) => /Appalach|Atlantic|Gulf Coastal/.test(n)));
  const { splitCsvLine, keepCode } = await import("./build-evt-names.mjs");
  assert.deepEqual(splitCsvLine('1,"a, b",c'), ["1", "a, b", "c"]);
  assert.equal(keepCode(4401, "Alaska Arctic"), false);
  assert.equal(keepCode(7032, "Mediterranean California Red Fir Forest"), true);
});

test("scoreSpot: a host-bound species without its trees is scaled down hard; 'too cold' is never a good reason", () => {
  const h = byId("hydnum-repandum");
  const t = { elevationM: 1400, slopeDeg: 5, aspect: "N", tpiM: -10 };
  const town = scoreSpot(h, 11, { lat: 0, lon: 0, terrain: t, cond: { ...WET, soilTempC: 3 }, evt: describeEvt(7298), burn: null });
  assert.ok(town.score < 40, `hedgehog in town scored ${town.score}`);
  const cold = town.reasons.find((r) => /too cold/.test(r.text));
  assert.ok(cold && !cold.good);
});
