import test from "node:test";
import assert from "node:assert/strict";
import { executeTool, TOOL_SCHEMAS } from "../lib/chat/tools.ts";
import { buildSystemPrompt } from "../lib/chat/prompt.ts";

// Flat 2000 m terrain with a gentle eastward tilt, ponderosa cover, wet mild week.
function tile() {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let py = 0; py < 256; py++)
    for (let px = 0; px < 256; px++) {
      const v = 2000 + px + 32768;
      const i = (py * 256 + px) * 4;
      data[i] = Math.floor(v / 256);
      data[i + 1] = v % 256;
      data[i + 3] = 255;
    }
  return { width: 256, height: 256, data };
}
const DAYS = Array.from({ length: 10 }, (_, i) => `2026-09-${String(7 + i).padStart(2, "0")}`);
const loc = () => ({
  elevation: 2000,
  daily: { time: DAYS, precipitation_sum: DAYS.map(() => 4), relative_humidity_2m_mean: DAYS.map(() => 70), temperature_2m_max: DAYS.map(() => 18), temperature_2m_min: DAYS.map(() => 5) },
  hourly: {
    time: DAYS.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`)),
    soil_moisture_3_to_9cm: DAYS.flatMap(() => Array(24).fill(0.25)),
    soil_temperature_6cm: DAYS.flatMap(() => Array(24).fill(12)),
  },
});
const findDeps = {
  fetchJson: async (url) => {
    const u = new URL(url);
    if (u.hostname === "api.open-meteo.com") {
      const n = u.searchParams.get("latitude").split(",").length;
      return { ok: true, json: async () => (n === 1 ? loc() : Array.from({ length: n }, loc)) };
    }
    return { ok: true, json: async () => ({ features: [{ properties: { GRAY_INDEX: 7053 } }] }) };
  },
  fetchTile: async () => tile(),
  loadBurns: async () => ({ features: [] }),
};
const ctx = { lat: 39.33, lon: -120.18, locationLabel: "Truckee", regionId: "sierra-nevada", findDeps, today: "2026-09-14" };

test("find_forage_spots schema is registered with a required species", () => {
  const t = TOOL_SCHEMAS.find((x) => x.name === "find_forage_spots");
  assert.ok(t);
  assert.deepEqual(t.input_schema.required, ["species"]);
});

test("find_forage_spots returns ranked spots and emits a card with a map link", async () => {
  const cards = [];
  const json = await executeTool("find_forage_spots", { species: "white king bolete", radiusKm: 15 }, ctx, (c) => cards.push(c));
  const out = JSON.parse(json);
  assert.equal(out.species.id, "boletus-barrowsii");
  assert.ok(out.spots.length >= 1 && out.spots.length <= 5);
  assert.ok(out.spots[0].why.length > 0);
  assert.equal(out.mapLink, "/?find=boletus-barrowsii");
  assert.equal(out.radiusKm, 15);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].tool, "find_forage_spots");
});

test("find_forage_spots: out of season is honest; unsafe or unknown species and no location are errors", async () => {
  const out = JSON.parse(await executeTool("find_forage_spots", { species: "morels" }, { ...ctx, today: "2026-11-20" }, () => {}));
  assert.equal(out.status, "out-of-season");
  assert.equal(out.spots.length, 0);
  assert.ok(out.inSeasonNow.length > 0);
  await assert.rejects(executeTool("find_forage_spots", { species: "death cap" }, ctx, () => {}), /isn't a findable species/);
  await assert.rejects(executeTool("find_forage_spots", { species: "morels" }, { ...ctx, lat: null, lon: null }, () => {}), /location/);
});

test("prompt tells the model to call find_forage_spots and not invent coordinates", () => {
  const { staticText } = buildSystemPrompt({ todayISO: "2026-11-20", regionLabel: "Sierra", locationLabel: "x", lat: null, lon: null });
  assert.match(staticText, /find_forage_spots/);
  assert.match(staticText, /Never invent coordinates/);
});
