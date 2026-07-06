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
