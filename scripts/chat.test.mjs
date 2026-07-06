import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSystemPrompt,
  SAFETY_DISCLAIMER,
  WEB_PREFIX,
} from "../lib/chat/prompt.ts";
import { safeHref, parseInline } from "../lib/chat/text.ts";
import {
  pruneSessions,
  createSession,
  turnsToMessages,
  loadSessions,
  saveSessions,
  MAX_SESSIONS,
  HISTORY_TURN_CAP,
} from "../lib/chat/store.ts";
import {
  TOOL_SCHEMAS,
  WEB_SEARCH_TOOL,
  searchCatalog,
  getSpeciesDetail,
  capJson,
  executeTool,
} from "../lib/chat/tools.ts";
import { PNW_CATALOG } from "../lib/species-catalog.ts";
import { speciesRoute } from "../lib/chat/species-route.ts";

test("static prompt carries the safety disclaimer verbatim", () => {
  const { staticText } = buildSystemPrompt({
    todayISO: "2026-07-05",
    regionLabel: "Sierra Nevada & Great Basin",
    locationLabel: "Tahoe Meadows",
    lat: 39.312,
    lon: -119.896,
  });
  assert.ok(staticText.includes(SAFETY_DISCLAIMER));
  assert.ok(staticText.includes(WEB_PREFIX));
  assert.ok(staticText.includes("[[species:"));
  // safety rules
  assert.match(staticText, /never confirm .* safe to eat/i);
  assert.match(staticText, /spore print/i);
});

test("dynamic prompt carries context, static prompt does not", () => {
  const ctx = {
    todayISO: "2026-07-05",
    regionLabel: "California Coast",
    locationLabel: "Mendocino",
    lat: 39.3,
    lon: -123.8,
  };
  const { staticText, dynamicText } = buildSystemPrompt(ctx);
  assert.ok(dynamicText.includes("2026-07-05"));
  assert.ok(dynamicText.includes("California Coast"));
  assert.ok(dynamicText.includes("Mendocino"));
  // static block must stay byte-stable across contexts (prompt caching)
  const again = buildSystemPrompt({ ...ctx, todayISO: "2027-01-01", regionLabel: "X", locationLabel: "Y" });
  assert.equal(staticText, again.staticText);
});

test("dynamic prompt formats coordinates and handles missing location", () => {
  const withLoc = buildSystemPrompt({
    todayISO: "2026-07-05",
    regionLabel: "R",
    locationLabel: "Tahoe Meadows",
    lat: 39.312,
    lon: -119.896,
  });
  assert.ok(withLoc.dynamicText.includes("Tahoe Meadows (39.312, -119.896)"));
  const noLoc = buildSystemPrompt({
    todayISO: "2026-07-05",
    regionLabel: "R",
    locationLabel: "",
    lat: null,
    lon: null,
  });
  assert.ok(noLoc.dynamicText.includes("User location: not set"));
});

test("safeHref allows only http(s)", () => {
  assert.equal(safeHref("https://example.gov/regs"), "https://example.gov/regs");
  assert.equal(safeHref("http://example.com"), "http://example.com");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref(""), null);
});

test("parseInline tokenizes species tokens, links, bold, text", () => {
  const parts = parseInline(
    "Try **king bolete** [[species:boletus-edulis]] — see [CDFW](https://wildlife.ca.gov) or [bad](javascript:x)."
  );
  assert.deepEqual(parts[0], { kind: "text", text: "Try " });
  assert.deepEqual(parts[1], { kind: "bold", text: "king bolete" });
  assert.ok(parts.some((p) => p.kind === "species" && p.id === "boletus-edulis"));
  assert.ok(
    parts.some((p) => p.kind === "link" && p.href === "https://wildlife.ca.gov" && p.text === "CDFW")
  );
  // javascript: link degrades to plain text
  assert.ok(parts.some((p) => p.kind === "text" && p.text.includes("bad")));
  assert.ok(!parts.some((p) => p.kind === "link" && p.href.startsWith("javascript")));
});

test("parseInline keeps balanced parens inside link URLs", () => {
  const parts = parseInline("[Boletus](https://en.wikipedia.org/wiki/Boletus_(genus)) rocks");
  const link = parts.find((p) => p.kind === "link");
  assert.equal(link.href, "https://en.wikipedia.org/wiki/Boletus_(genus)");
  assert.equal(parts[parts.length - 1].text, " rocks");
});

test("parseInline degrades unclosed tokens to literal text", () => {
  const parts = parseInline("**unclosed and [half](https://x.co");
  assert.ok(parts.every((p) => p.kind === "text"));
  assert.equal(parts.map((p) => p.text).join(""), "**unclosed and [half](https://x.co");
});

test("pruneSessions keeps the newest MAX_SESSIONS by updatedAt", () => {
  const mk = (i) => ({
    id: `s${i}`, title: `t${i}`,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
    turns: [],
  });
  const many = Array.from({ length: MAX_SESSIONS + 5 }, (_, i) => mk(i));
  const pruned = pruneSessions(many);
  assert.equal(pruned.length, MAX_SESSIONS);
  assert.equal(pruned[0].id, `s${MAX_SESSIONS + 4}`); // newest first
});

test("createSession titles from first message, truncated", () => {
  const s = createSession("x".repeat(100));
  assert.equal(s.title.length, 48);
  assert.equal(s.turns.length, 0);
  assert.ok(s.id.length > 8);
});

test("turnsToMessages caps history and maps to text messages", () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    text: `m${i}`,
  }));
  const msgs = turnsToMessages(turns);
  assert.equal(msgs.length, HISTORY_TURN_CAP);
  assert.deepEqual(msgs[msgs.length - 1], { role: "assistant", content: "m19" });
  assert.equal(msgs[0].role, "user"); // must start with a user turn
});

test("loadSessions recovers from corrupt or foreign localStorage data", () => {
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
    removeItem: (k) => backing.delete(k),
  };
  try {
    backing.set("foray.chat.sessions.v1", "{not json");
    assert.deepEqual(loadSessions(), []);
    backing.set("foray.chat.sessions.v1", JSON.stringify({ nope: 1 }));
    assert.deepEqual(loadSessions(), []);
    backing.set(
      "foray.chat.sessions.v1",
      JSON.stringify([null, { id: "ok", title: "t", createdAt: "c", updatedAt: "u", turns: [] }, { id: "no-turns" }])
    );
    const loaded = loadSessions();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, "ok");
  } finally {
    delete globalThis.localStorage;
  }
});

test("saveSessions swallows quota errors instead of throwing", () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  try {
    assert.doesNotThrow(() => saveSessions([]));
  } finally {
    delete globalThis.localStorage;
  }
});

test("tool schemas: five client tools, unique names, frozen order", () => {
  const names = TOOL_SCHEMAS.map((t) => t.name);
  assert.deepEqual(names, [
    "search_catalog",
    "get_species",
    "get_weather",
    "find_spots",
    "read_journal",
  ]);
  assert.equal(new Set(names).size, names.length);
  assert.equal(WEB_SEARCH_TOOL.type, "web_search_20260209");
  assert.equal(WEB_SEARCH_TOOL.max_uses, 3);
});

test("searchCatalog finds mushrooms by name and respects limit", () => {
  const hits = searchCatalog({ query: "chanterelle", kind: "mushroom", limit: 5 });
  assert.ok(hits.length > 0 && hits.length <= 5);
  assert.ok(hits.every((h) => h.kind === "mushroom"));
  assert.ok(
    hits.some(
      (h) =>
        h.common.toLowerCase().includes("chanterelle") ||
        h.scientific.toLowerCase().includes("cantharellus")
    )
  );
  // every id must resolve back into the catalog
  for (const h of hits) {
    assert.ok(PNW_CATALOG.some((s) => s.id === h.id));
  }
});

test("searchCatalog filters by month and edibility family", () => {
  const july = searchCatalog({ kind: "mushroom", month: 7, edibility: "edible", limit: 10 });
  assert.ok(july.length > 0);
  for (const h of july) {
    assert.ok(h.months.includes(7));
    assert.ok(h.edibility === "choice" || h.edibility.startsWith("edible"));
  }
});

test("getSpeciesDetail returns mushroom detail with lookalike dangers", () => {
  const any = PNW_CATALOG.find((s) => s.lookalikes.length > 0);
  const detail = getSpeciesDetail(any.id);
  assert.equal(detail.kind, "mushroom");
  assert.equal(detail.id, any.id);
  assert.ok(Array.isArray(detail.lookalikes));
  assert.ok("danger" in detail.lookalikes[0]);
  assert.equal(detail.edibility, any.edibility);
});

test("getSpeciesDetail throws a helpful error on unknown id", () => {
  assert.throws(() => getSpeciesDetail("not-a-real-id"), /No species with id/);
});

test("searchCatalog interleaves kinds on cross-catalog queries", () => {
  const hits = searchCatalog({ month: 7, limit: 9 });
  const kinds = new Set(hits.map((h) => h.kind));
  assert.ok(kinds.size >= 2, `expected multiple kinds, got ${[...kinds]}`);
});

test("searchCatalog edibility aliases work across catalog vocabularies", () => {
  const cooked = searchCatalog({ kind: "mushroom", edibility: "edible-cooked", limit: 5 });
  assert.ok(cooked.length > 0);
  assert.ok(cooked.every((h) => h.edibility === "edible-when-cooked"));
});

test("searchCatalog region filter narrows results", () => {
  const all = searchCatalog({ kind: "mushroom", limit: 10 });
  const coastal = searchCatalog({ kind: "mushroom", region: "california-coast", limit: 10 });
  assert.ok(coastal.length > 0);
  assert.ok(all.length >= coastal.length);
});

test("getSpeciesDetail returns plant and ocean safety fields", () => {
  const plant = getSpeciesDetail("stinging-nettle");
  assert.equal(plant.kind, "plant");
  assert.ok("preparation" in plant && "cautions" in plant);
  const ocean = getSpeciesDetail("bull-kelp");
  assert.equal(ocean.kind, "ocean");
  assert.ok("biotoxinNotes" in ocean && "regulations" in ocean);
});

test("capJson truncates at the cap with a marker", () => {
  const big = { blob: "x".repeat(20000) };
  const out = capJson(big);
  assert.ok(out.length <= 8000 + 30);
  assert.ok(out.endsWith("…[truncated]"));
  assert.equal(capJson({ a: 1 }), '{"a":1}');
});

test("executeTool dispatches search_catalog and emits a card", async () => {
  const cards = [];
  const ctx = { lat: null, lon: null, locationLabel: "", regionId: "all" };
  const out = await executeTool(
    "search_catalog",
    { query: "chanterelle", kind: "mushroom" },
    ctx,
    (c) => cards.push(c)
  );
  const parsed = JSON.parse(out);
  assert.ok(Array.isArray(parsed) && parsed.length > 0);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].tool, "search_catalog");
});

test("executeTool rejects unknown tools and find_spots without location", async () => {
  const ctx = { lat: null, lon: null, locationLabel: "", regionId: "all" };
  await assert.rejects(() => executeTool("nope", {}, ctx, () => {}), /Unknown tool/);
  await assert.rejects(() => executeTool("find_spots", {}, ctx, () => {}), /location/i);
});

test("read_journal returns [] outside the browser and never leaks photos", async () => {
  const ctx = { lat: null, lon: null, locationLabel: "", regionId: "all" };
  const out = await executeTool("read_journal", {}, ctx, () => {});
  assert.deepEqual(JSON.parse(out), []);
});

test("get_species output stays valid JSON with lookalikes under the cap for the largest records", async () => {
  const ctx = { lat: null, lon: null, locationLabel: "", regionId: "all" };
  const biggest = PNW_CATALOG
    .map((s) => ({ id: s.id, len: JSON.stringify(getSpeciesDetail(s.id)).length }))
    .sort((a, b) => b.len - a.len)
    .slice(0, 3);
  for (const { id } of biggest) {
    const out = await executeTool("get_species", { id }, ctx, () => {});
    assert.ok(out.length <= 8000, `${id}: ${out.length}`);
    const parsed = JSON.parse(out); // throws if the fallback slicer corrupted it
    assert.ok(Array.isArray(parsed.lookalikes), `${id} lost lookalikes`);
    assert.ok(parsed.edibility, `${id} lost edibility`);
  }
});

test("speciesRoute resolves every mushroom id and real plant/ocean ids", () => {
  for (const s of PNW_CATALOG) {
    const r = speciesRoute(s.id);
    assert.ok(r, s.id);
    assert.ok(r.href === `/catalog/${s.id}`, s.id);
    assert.ok(r.label.length > 0, `${s.id} has empty label`);
  }
  assert.equal(speciesRoute("stinging-nettle").href, "/plants/stinging-nettle");
  assert.equal(speciesRoute("bull-kelp").href, "/ocean/bull-kelp");
  assert.equal(speciesRoute("not-a-real-id"), null);
});
