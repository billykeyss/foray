// Review fix round: confidence gating, host-token matching, deadly-lookalike cautions, fetch
// timeouts, stored-result reuse, units, flat ground, rain window and DEM zoom.
import test from "node:test";
import assert from "node:assert/strict";
import { PNW_CATALOG } from "../lib/species-catalog.ts";
import { findableProfiles } from "../lib/forage-find/profiles.ts";
import { findForageSpots, LOW_CONFIDENCE_CAP } from "../lib/forage-find/run.ts";
import { scoreSpot } from "../lib/forage-find/score.ts";
import { describeEvt, fetchEvt } from "../lib/forage-find/landcover.ts";
import { fetchConditions, parseOpenMeteo } from "../lib/forage-find/conditions.ts";
import { FIND_KEY, matchStored, shouldStoreFind } from "../lib/forage-find/store.ts";
import { reasonText, fmtElev } from "../lib/forage-find/format.ts";
import { timedSignal } from "../lib/forage-find/net.ts";
import { executeTool } from "../lib/chat/tools.ts";
import { buildSystemPrompt } from "../lib/chat/prompt.ts";

const PROFILES = findableProfiles(PNW_CATALOG);
const P = (id) => PROFILES.find((p) => p.id === id);
const CENTER = { lat: 39.33, lon: -120.18, label: "Truckee" };

function tile() {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let py = 0; py < 256; py++)
    for (let px = 0; px < 256; px++) {
      const v = 1900 + Math.round(30 * Math.sin(px / 9)) + 32768;
      const i = (py * 256 + px) * 4;
      data[i] = Math.floor(v / 256);
      data[i + 1] = v % 256;
      data[i + 3] = 255;
    }
  return { width: 256, height: 256, data };
}
const DAYS = Array.from({ length: 10 }, (_, i) => `2026-09-${String(7 + i).padStart(2, "0")}`);
const omLoc = () => ({
  elevation: 1900,
  daily: { time: DAYS, precipitation_sum: DAYS.map(() => 5), relative_humidity_2m_mean: DAYS.map(() => 75), temperature_2m_max: DAYS.map(() => 18), temperature_2m_min: DAYS.map(() => 4) },
  hourly: {
    time: DAYS.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`)),
    soil_moisture_3_to_9cm: DAYS.flatMap(() => Array(24).fill(0.26)),
    soil_temperature_6cm: DAYS.flatMap(() => Array(24).fill(11)),
  },
});
const fail = async () => {
  throw new TypeError("Failed to fetch");
};
function deps({ wx = true, terrain = true, trees = true, zooms = [] } = {}) {
  return {
    fetchJson: async (url) => {
      const u = new URL(url);
      if (u.hostname === "api.open-meteo.com") {
        if (!wx) throw new TypeError("Failed to fetch");
        const n = u.searchParams.get("latitude").split(",").length;
        return { ok: true, json: async () => (n === 1 ? omLoc() : Array.from({ length: n }, omLoc)) };
      }
      if (!trees) throw new TypeError("Failed to fetch");
      return { ok: true, json: async () => ({ features: [{ properties: { GRAY_INDEX: 7053 } }] }) };
    },
    fetchTile: terrain
      ? async (z) => {
          zooms.push(z);
          return tile();
        }
      : fail,
    loadBurns: async () => ({ features: [] }),
  };
}
const run = (d, extra = {}) =>
  findForageSpots({ profile: P("boletus-barrowsii"), allProfiles: PROFILES, center: CENTER, radiusKm: 15, today: "2026-09-14", deps: d, gridTarget: 12, ...extra });

// ---- CRITICAL: confidence ----

test("no weather: low-confidence status, capped scores, plain message", async () => {
  const r = await run(deps({ wx: false }));
  assert.equal(r.status, "low-confidence");
  assert.ok(r.spots.length > 0);
  for (const s of r.spots) assert.ok(s.score <= LOW_CONFIDENCE_CAP, `score ${s.score}`);
  assert.match(r.message, /weather/i);
  assert.equal(shouldStoreFind(r), false);
});

test("no weather and no terrain: unavailable, no pins, never stored", async () => {
  const r = await run(deps({ wx: false, terrain: false, trees: false }));
  assert.equal(r.status, "unavailable");
  assert.deepEqual(r.spots, []);
  assert.equal(shouldStoreFind(r), false);
});

test("good data is stored; out-of-season is stored", async () => {
  const r = await run(deps());
  assert.equal(r.status, "ok");
  assert.equal(shouldStoreFind(r), true);
  const out = await findForageSpots({ profile: P("morchella-tomentosa"), allProfiles: PROFILES, center: CENTER, today: "2026-11-20", deps: deps() });
  assert.equal(shouldStoreFind(out), true);
});

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("tool: everything failing is an error and never overwrites the last good result", async () => {
  const prev = globalThis.localStorage;
  globalThis.localStorage = fakeStorage();
  try {
    localStorage.setItem(FIND_KEY, "GOOD");
    const ctx = { lat: 39.33, lon: -120.18, locationLabel: "Truckee", regionId: "sierra-nevada", today: "2026-11-20", findDeps: { fetchJson: fail, fetchTile: fail, loadBurns: async () => ({ features: [] }) } };
    await assert.rejects(executeTool("find_forage_spots", { species: "hedgehog" }, ctx, () => {}), /couldn't reach|unavailable/i);
    assert.equal(localStorage.getItem(FIND_KEY), "GOOD");
    // Weather only failing: a low-confidence result comes back but is not stored either.
    const ctx2 = { ...ctx, today: "2026-09-14", findDeps: deps({ wx: false }) };
    const out = JSON.parse(await executeTool("find_forage_spots", { species: "white king bolete", radiusKm: 15 }, ctx2, () => {}));
    assert.equal(out.status, "low-confidence");
    assert.ok(out.spots.every((s) => s.score <= LOW_CONFIDENCE_CAP));
    assert.equal(localStorage.getItem(FIND_KEY), "GOOD");
  } finally {
    globalThis.localStorage = prev;
  }
});

test("tool: a chat abort signal stops the run", async () => {
  const ac = new AbortController();
  ac.abort();
  const ctx = { lat: 39.33, lon: -120.18, locationLabel: "Truckee", regionId: "sierra-nevada", today: "2026-09-14", findDeps: deps(), signal: ac.signal };
  await assert.rejects(executeTool("find_forage_spots", { species: "white king bolete" }, ctx, () => {}), (e) => e.name === "AbortError");
});

// ---- host matching ----

test("host keywords match whole words, and only tree cover is a full host match", () => {
  const bolete = P("boletus-barrowsii");
  assert.ok(bolete.hosts.includes("pine") || bolete.hosts.includes("ponderosa"));
  const pineSp = { ...bolete, hosts: ["pine"], substrate: "soil" };
  const t = { elevationM: 1900, slopeDeg: 8, aspect: "N", tpiM: 0 };
  const host = (code, p = pineSp) => scoreSpot(p, 9, { lat: 0, lon: 0, terrain: t, cond: null, evt: describeEvt(code), burn: null }).factors.host;
  for (const code of [7071, 7137, 7144]) assert.ok(host(code) < 0.5, `${code} ${describeEvt(code).name} = ${host(code)}`);
  assert.equal(host(7053), 1); // ponderosa pine woodland
  const oakSp = { ...bolete, hosts: ["oak"], substrate: "soil" };
  const chap = Object.keys(describeEvt(0) ?? {}).length; // keep linter quiet
  void chap;
  const oakShrub = [...Array(3000).keys()].map((i) => describeEvt(7000 + i)).find((e) => e && /oak/i.test(`${e.name}`) && e.lifeform === "Shrub");
  assert.ok(oakShrub, "an oak shrubland exists in the table");
  assert.ok(host(oakShrub.code, oakSp) < 0.5, `${oakShrub.name}`);
  const fir = { ...bolete, hosts: ["fir"] };
  const dfir = [...Array(3000).keys()].map((i) => describeEvt(7000 + i)).find((e) => e && /Douglas-fir/.test(e.name) && e.lifeform === "Tree");
  assert.equal(host(dfir.code, fir), 1);
});

// ---- deadly lookalikes ----

test("every findable species with a deadly lookalike carries a caution naming it", () => {
  const by = new Map(PNW_CATALOG.map((s) => [s.id, s]));
  let n = 0;
  for (const p of PROFILES) {
    const deadly = (by.get(p.id).lookalikes ?? []).filter((l) => l.danger === "deadly");
    for (const l of deadly) {
      n++;
      assert.ok(p.cautions.some((c) => c.startsWith("Deadly lookalike") && c.includes(l.scientific)), `${p.id} → ${l.scientific}`);
    }
  }
  assert.ok(n >= 18, `found ${n}`);
  const oyster = P("pleurotus-ostreatus") ?? P("pleurotus-populinus");
  assert.ok(oyster.cautions.some((c) => /Pleurocybella/.test(c)), oyster.cautions.join(" | "));
  // Morel overrides keep their own cautions too.
  assert.ok(P("morchella-tomentosa").cautions.some((c) => /cook/i.test(c)));
});

// ---- timeouts ----

const hang = (url, init) =>
  new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal.reason ?? new Error("aborted"))));

test("timedSignal aborts after the timeout and follows the parent", async () => {
  const s = timedSignal(undefined, 20);
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(s.aborted);
  const ac = new AbortController();
  const s2 = timedSignal(ac.signal, 10_000);
  ac.abort();
  assert.ok(s2.aborted);
});

test("LANDFIRE and Open-Meteo fetches time out instead of hanging", async () => {
  const keep = setTimeout(() => {}, 5000); // AbortSignal.timeout timers don't hold node's event loop open
  const t0 = Date.now();
  await assert.rejects(fetchEvt(39, -120, hang, undefined, 30));
  await assert.rejects(fetchConditions([{ lat: 39, lon: -120 }], "2026-09-14", hang, undefined, 30));
  assert.ok(Date.now() - t0 < 2000);
  clearTimeout(keep);
});

// ---- stored result reuse ----

test("matchStored: exact only within ~3 km and the same radius", () => {
  const stored = { speciesId: "hydnum-repandum", center: { lat: 39.26, lon: -121.02, label: "Nevada City" }, radiusKm: 40 };
  assert.equal(matchStored(stored, { speciesId: "hydnum-repandum", lat: 39.27, lon: -121.0, radiusKm: 40 }), "exact");
  assert.equal(matchStored(stored, { speciesId: "hydnum-repandum", lat: 39.33, lon: -120.18, radiusKm: 40 }), "other");
  assert.equal(matchStored(stored, { speciesId: "hydnum-repandum", lat: 39.26, lon: -121.02, radiusKm: 15 }), "other");
  assert.equal(matchStored(stored, { speciesId: "boletus-edulis", lat: 39.26, lon: -121.02, radiusKm: 40 }), null);
  assert.equal(matchStored(null, { speciesId: "x", lat: 0, lon: 0, radiusKm: 40 }), null);
});

// ---- units ----

test("reasons carry raw numbers; the UI formats them in metric or imperial", async () => {
  const r = await run(deps());
  const rain = r.spots[0].reasons.find((x) => x.q?.kind === "rain");
  assert.ok(rain, "rain reason has a raw value");
  assert.equal(reasonText(rain, "metric"), rain.text);
  assert.match(reasonText(rain, "imperial"), /^\d+(\.\d)? in rain past 7 d$/);
  const soil = { factor: "soilTemp", text: "Soil 11 °C", good: true, weight: 1, q: { kind: "temp", value: 11, tpl: "Soil {v}" } };
  assert.equal(reasonText(soil, "imperial"), "Soil 52 °F");
  assert.equal(fmtElev(1712, "imperial"), "5,617 ft");
  assert.equal(fmtElev(1712, "metric"), "1,712 m");
});

// ---- flat ground ----

test("flat ground is not treated as water unless LANDFIRE says water", () => {
  const shaggy = P("coprinus-comatus");
  const flat = { elevationM: 1500, slopeDeg: 0.1, aspect: null, tpiM: 0.1 };
  const herb = [...Array(3000).keys()].map((i) => describeEvt(7000 + i)).find((e) => e && e.lifeform === "Herb");
  const meadow = scoreSpot(shaggy, 10, { lat: 0, lon: 0, terrain: flat, cond: null, evt: herb, burn: null });
  assert.ok(!meadow.reasons.some((x) => /water/i.test(x.text)));
  assert.ok(meadow.score > 30, `meadow ${meadow.score}`);
  const water = [...Array(3000).keys()].map((i) => describeEvt(7000 + i)).find((e) => e && e.lifeform === "Water") ?? { code: 7292, name: "Open Water", lifeform: "Water", physiognomy: "", group: "", coverType: "" };
  assert.equal(scoreSpot(shaggy, 10, { lat: 0, lon: 0, terrain: flat, cond: null, evt: water, burn: null }).score, 0);
});

// ---- rain window ----

test("past-week rain excludes today's (forecast) rain", () => {
  const loc = omLoc();
  const i = DAYS.indexOf("2026-09-14");
  loc.daily.precipitation_sum = DAYS.map((d, k) => (k === i ? 100 : 5));
  const c = parseOpenMeteo(loc, "2026-09-14");
  assert.equal(c.rain7dMm, 35); // 7 full past days × 5 mm
});

// ---- data use ----

test("80 km searches use z11 terrain tiles; smaller radii z12", async () => {
  const z80 = [];
  await findForageSpots({ profile: P("boletus-barrowsii"), allProfiles: PROFILES, center: CENTER, radiusKm: 80, today: "2026-09-14", deps: deps({ zooms: z80 }), gridTarget: 12 });
  assert.ok(z80.length && z80.every((z) => z === 11));
  const z15 = [];
  await run(deps({ zooms: z15 }));
  assert.ok(z15.length && z15.every((z) => z === 12));
});

test("prompt: relay every species caution (lookalikes) and the low-confidence state", () => {
  const { staticText } = buildSystemPrompt({ todayISO: "2026-11-20", regionLabel: "x", locationLabel: "y", lat: null, lon: null });
  assert.match(staticText, /EVERY entry in its cautions/);
  assert.match(staticText, /low-confidence/);
});

test("tool card data carries raw reasons for unit formatting; model JSON keeps species cautions", async () => {
  const cards = [];
  const ctx = { lat: 39.33, lon: -120.18, locationLabel: "Truckee", regionId: "sierra-nevada", today: "2026-09-14", findDeps: deps() };
  const out = JSON.parse(await executeTool("find_forage_spots", { species: "white king bolete", radiusKm: 15 }, ctx, (c) => cards.push(c)));
  assert.ok(cards[0].data.spots[0].reasons.some((r) => r.q?.kind === "rain"));
  assert.ok(!("reasons" in out.spots[0]));
  const lookalikes = PNW_CATALOG.find((s) => s.id === "boletus-barrowsii").lookalikes ?? [];
  if (lookalikes.some((l) => l.danger === "deadly")) assert.ok(out.cautions.some((c) => c.startsWith("Deadly lookalike")));
});
