# Foray Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/chat` ("Ask") — a browser-side streaming Claude tool-use agent over Foray's bundled catalog/weather/spots/journal data, per the approved spec at `docs/superpowers/specs/2026-07-05-chat-agent-design.md`.

**Architecture:** All agent logic lives in `lib/chat/*.ts` (no JSX, explicit `.ts` import extensions, so `node --test --experimental-strip-types` can import it). The loop calls `api.anthropic.com` directly from the browser via `@anthropic-ai/sdk` (`dangerouslyAllowBrowser`) with the user's key from the existing `ApiKeyProvider`. UI is `app/chat/page.tsx` + `components/chat/*`. Sessions persist to localStorage.

**Tech Stack:** Next.js 15 static export, React 19, `@anthropic-ai/sdk` (new dep — the only one), model `claude-sonnet-5`, node:test.

**Branch:** `feat/chat-agent` (already created; spec committed). Do NOT push — pushing `main` deploys, and the maintainer pushes themselves.

**Conventions that will bite you if ignored:**
- Runtime imports between `lib/` modules use explicit `.ts` extensions (`import { REGIONS } from "../regions.ts"`). Keep them — both Next and node resolve them.
- `lib/chat/*.ts` must never import React, JSX, or `@anthropic-ai/sdk` **except** `lib/chat/agent.ts` (SDK only), which node tests must NOT import.
- Tests are plain `node --test` files under `scripts/`. Run a single file with:
  `node --test --experimental-strip-types scripts/chat.test.mjs`
- Guard every `localStorage` access with `typeof localStorage === "undefined"` (node tests import these modules).

---

### Task 1: Install the SDK

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
cd /Users/yichenhuang/projects/mushroom-rain-tracker
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Verify it resolves**

Run: `node -e "console.log(require('@anthropic-ai/sdk/package.json').version)"`
Expected: a version string ≥ 0.60 (any current version is fine).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk for the chat agent"
```

---

### Task 2: System prompt — `lib/chat/prompt.ts`

**Files:**
- Create: `lib/chat/prompt.ts`
- Test: `scripts/chat.test.mjs` (new file, grows across tasks)

- [ ] **Step 1: Write the failing tests**

Create `scripts/chat.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSystemPrompt,
  SAFETY_DISCLAIMER,
  WEB_PREFIX,
} from "../lib/chat/prompt.ts";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/chat/prompt.ts'`

- [ ] **Step 3: Implement `lib/chat/prompt.ts`**

```ts
/**
 * System prompt for the Foray chat agent. Split into a byte-stable static
 * block (gets a cache_control breakpoint) and a small dynamic block
 * (date/region/location) appended after it — see the prompt-caching notes in
 * the design spec.
 */

export const SAFETY_DISCLAIMER =
  "Never eat a wild mushroom based on this chat — confirm with a spore print and a local expert.";

export const WEB_PREFIX =
  "From a web search (not Foray's verified catalog):";

export interface ChatContext {
  todayISO: string;
  regionLabel: string;
  locationLabel: string;
  lat: number | null;
  lon: number | null;
}

const STATIC_PROMPT = `You are Foray's foraging field-guide assistant, embedded in the Foray app (a Sierra Nevada / Pacific Northwest field guide for mushrooms, wild plants, and coastal foraging).

# Tools and grounding
- Answer species, edibility, identification, season, and conditions questions ONLY from tool results in this conversation — never from memory.
- Check Foray's catalog and weather tools FIRST. Use web_search only when they have no answer, and begin every web-sourced part of your reply with the literal prefix "${WEB_PREFIX}".
- If neither the catalog nor the web has an answer, say so plainly.

# Safety rules (non-negotiable)
- NEVER confirm that a specific find is safe to eat from chat alone. You cannot see the specimen.
- When get_species returns lookalikes, ALWAYS mention the dangerous ones (danger "deadly" or "toxic") by name with their distinguishing feature.
- State edibility using the catalog's edibility field verbatim (e.g. "choice", "edible-when-cooked", "deadly"); add the catalog's toxicity/caution notes when present.
- Recommend physical verification: spore print, checking with a local expert or mycological society.
- End EVERY answer that touches edibility or identification with exactly: "${SAFETY_DISCLAIMER}"

# Citations
- Reference catalog species with [[species:<id>]] tokens, only for ids that appeared in tool results in THIS conversation. Never invent an id. Place the token right after the species name, e.g. "king bolete [[species:boletus-edulis]]".
- Cite web facts with inline markdown links whose URLs came from web_search results in THIS conversation. Never invent or recall URLs.

# Style
- Plain, concise prose for people standing in the field. No markdown tables — the app renders structured cards for tool data. Bullets are fine.
- Metric units with imperial in parentheses where helpful.`;

export function buildSystemPrompt(ctx: ChatContext): {
  staticText: string;
  dynamicText: string;
} {
  const loc =
    ctx.lat != null && ctx.lon != null
      ? `${ctx.locationLabel} (${ctx.lat.toFixed(3)}, ${ctx.lon.toFixed(3)})`
      : "not set";
  const dynamicText = `# Session context
Today: ${ctx.todayISO}
Active region: ${ctx.regionLabel}
User location: ${loc}`;
  return { staticText: STATIC_PROMPT, dynamicText };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/chat/prompt.ts scripts/chat.test.mjs
git commit -m "feat(chat): system prompt with safety rules and cache-stable static block"
```

---

### Task 3: Text helpers — `lib/chat/text.ts`

`safeHref` (http(s)-only, Keeper's fix) and an inline tokenizer for the hand-rolled renderer: bold, markdown links, `[[species:id]]` tokens.

**Files:**
- Create: `lib/chat/text.ts`
- Test: `scripts/chat.test.mjs` (append)

- [ ] **Step 1: Append failing tests to `scripts/chat.test.mjs`**

```js
import { safeHref, parseInline } from "../lib/chat/text.ts";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/chat/text.ts'`

- [ ] **Step 3: Implement `lib/chat/text.ts`**

```ts
/** Pure text helpers for the chat renderer. No React, no DOM. */

export function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

export type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "species"; id: string };

// Order matters: species token, markdown link, bold.
const TOKEN = /\[\[species:([a-z0-9-]+)\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: "text", text: text.slice(last, idx) });
    if (m[1]) {
      parts.push({ kind: "species", id: m[1] });
    } else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      if (href) parts.push({ kind: "link", text: m[2], href });
      else parts.push({ kind: "text", text: m[2] }); // unsafe URL → text only
    } else if (m[4] !== undefined) {
      parts.push({ kind: "bold", text: m[4] });
    }
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/chat/text.ts scripts/chat.test.mjs
git commit -m "feat(chat): safeHref + inline tokenizer for the safe markdown renderer"
```

---

### Task 4: Session store — `lib/chat/store.ts`

**Files:**
- Create: `lib/chat/store.ts`
- Test: `scripts/chat.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

```js
import {
  pruneSessions,
  createSession,
  turnsToMessages,
  MAX_SESSIONS,
  HISTORY_TURN_CAP,
} from "../lib/chat/store.ts";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/chat/store.ts'`

- [ ] **Step 3: Implement `lib/chat/store.ts`**

```ts
/**
 * Chat session persistence (localStorage) + history→API-message conversion.
 * Pure helpers are exported for node tests; only load/save touch localStorage.
 */

export interface ChatCard {
  tool: string;
  data: unknown;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  cards?: ChatCard[];
  /** true when the user hit Stop mid-stream */
  stopped?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ChatTurn[];
}

const KEY = "foray.chat.sessions.v1";
export const ACTIVE_KEY = "foray.chat.active.v1";
export const MAX_SESSIONS = 30;
export const HISTORY_TURN_CAP = 12;

export function pruneSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, MAX_SESSIONS);
}

export function createSession(firstUserText: string): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: firstUserText.slice(0, 48),
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

/**
 * Rebuild API context from stored display turns: plain text messages, last
 * HISTORY_TURN_CAP turns, trimmed so the window starts on a user turn (the
 * API requires the first message to be role "user").
 */
export function turnsToMessages(
  turns: ChatTurn[]
): { role: "user" | "assistant"; content: string }[] {
  let window = turns.slice(-HISTORY_TURN_CAP);
  while (window.length && window[0].role !== "user") window = window.slice(1);
  return window.map((t) => ({ role: t.role, content: t.text }));
}

export function loadSessions(): ChatSession[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pruneSessions(sessions)));
  } catch (err) {
    console.error("chat session save failed", err);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/chat/store.ts scripts/chat.test.mjs
git commit -m "feat(chat): localStorage session store with pruning + history window"
```

---

### Task 5: Tool schemas + catalog tools — `lib/chat/tools.ts`

Search + species detail over all three catalogs, plus the frozen tool-definition array. SDK-free (plain objects).

**Files:**
- Create: `lib/chat/tools.ts`
- Test: `scripts/chat.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

```js
import {
  TOOL_SCHEMAS,
  WEB_SEARCH_TOOL,
  searchCatalog,
  getSpeciesDetail,
} from "../lib/chat/tools.ts";
import { PNW_CATALOG } from "../lib/species-catalog.ts";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/chat/tools.ts'`

- [ ] **Step 3: Implement `lib/chat/tools.ts` (part 1 — schemas + catalog tools)**

```ts
/**
 * Chat agent tools: Anthropic tool schemas (plain objects — this module is
 * SDK-free so node tests can import it) and their executors over the bundled
 * catalogs. Weather/spots/journal executors + the dispatcher are further down.
 */
import { PNW_CATALOG } from "../species-catalog.ts";
import { PLANT_CATALOG } from "../plant-catalog.ts";
import { OCEAN_CATALOG } from "../ocean-catalog.ts";
import { REGIONS, type RegionId } from "../regions.ts";
import { speciesInRegions } from "../region-filter.ts";
import { SPECIES_IMAGES } from "../species-images.ts";
import { localImage } from "../image-src.ts";
import type { MushroomSpecies } from "../species-types";
import type { PlantSpecies } from "../plant-types";
import type { OceanSpecies } from "../ocean-types";

export type CatalogKind = "mushroom" | "plant" | "ocean";

export const TOOL_RESULT_CAP = 8000;

export const TOOL_SCHEMAS = [
  {
    name: "search_catalog",
    description:
      "Search Foray's foraging catalogs (mushrooms, wild plants, coastal/ocean). Call this FIRST for any species question. Returns compact records with ids for get_species.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name fragment, common or scientific" },
        kind: { type: "string", enum: ["mushroom", "plant", "ocean"], description: "Restrict to one catalog" },
        edibility: {
          type: "string",
          description:
            "Filter: an exact edibility value, or 'edible' for the whole edible family (choice/edible/edible-*)",
        },
        month: { type: "number", description: "1-12; only species fruiting/harvestable that month" },
        region: {
          type: "string",
          enum: ["sierra-nevada", "pacific-northwest", "california-coast", "great-basin", "all"],
          description: "Filter by app region",
        },
        limit: { type: "number", description: "Max results, default 8, cap 10" },
      },
      required: [],
    },
  },
  {
    name: "get_species",
    description:
      "Full catalog record for one species id (from search_catalog): identification, edibility, safety notes, dangerous lookalikes, season, habitat, sources.",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "get_weather",
    description:
      "7-day weather outlook + Foray's Spore Score (0-100 fruiting-conditions composite) for coordinates. Defaults to the user's saved location.",
    input_schema: {
      type: "object" as const,
      properties: {
        lat: { type: "number" },
        lon: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "find_spots",
    description:
      "Score nearby known foraging spots by current weather (Spore Score). Use for 'where should I go' questions. Requires the user's location.",
    input_schema: {
      type: "object" as const,
      properties: {
        maxKm: { type: "number", description: "Search radius in km, default 250" },
        max: { type: "number", description: "Max spots, default 6, cap 10" },
      },
      required: [],
    },
  },
  {
    name: "read_journal",
    description:
      "The user's own foraging journal entries (species, location, date, notes, conditions), newest first. Use for questions about the user's past finds.",
    input_schema: {
      type: "object" as const,
      properties: { limit: { type: "number", description: "Default 10, cap 25" } },
      required: [],
    },
  },
];

/** Server-side tool — runs on Anthropic's infra, no client executor. */
export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 3,
};

export interface CatalogHit {
  id: string;
  kind: CatalogKind;
  common: string;
  scientific: string;
  edibility: string;
  months: number[];
  thumb: string | null;
}

function edibilityMatches(value: string, filter: string): boolean {
  if (filter === "edible") return value === "choice" || value.startsWith("edible");
  return value === filter;
}

function regionTerms(region?: string): string[] | null | undefined {
  if (!region) return undefined;
  return REGIONS.find((r) => r.id === (region as RegionId))?.terms ?? undefined;
}

export function searchCatalog(input: {
  query?: string;
  kind?: CatalogKind;
  edibility?: string;
  month?: number;
  region?: string;
  limit?: number;
}): CatalogHit[] {
  const limit = Math.min(input.limit ?? 8, 10);
  const q = input.query?.toLowerCase().trim();
  const terms = regionTerms(input.region);

  const pools: { kind: CatalogKind; items: (MushroomSpecies | PlantSpecies | OceanSpecies)[] }[] = [
    { kind: "mushroom", items: PNW_CATALOG },
    { kind: "plant", items: PLANT_CATALOG },
    { kind: "ocean", items: OCEAN_CATALOG },
  ];

  const hits: CatalogHit[] = [];
  for (const pool of pools) {
    if (input.kind && pool.kind !== input.kind) continue;
    for (const s of pool.items) {
      const months =
        "fruitingMonths" in s ? s.fruitingMonths : (s as PlantSpecies | OceanSpecies).harvestMonths;
      if (q) {
        const hay = [...s.commonNames, s.scientific].join(" ").toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (input.edibility && !edibilityMatches(String(s.edibility), input.edibility)) continue;
      if (input.month && !months.includes(input.month)) continue;
      if (terms !== undefined && !speciesInRegions(s, terms)) continue;
      hits.push({
        id: s.id,
        kind: pool.kind,
        common: s.commonNames[0],
        scientific: s.scientific,
        edibility: String(s.edibility),
        months,
        thumb:
          pool.kind === "mushroom" && SPECIES_IMAGES[s.id]?.thumb
            ? localImage(SPECIES_IMAGES[s.id].thumb)
            : null,
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

export type SpeciesDetail = Record<string, unknown> & {
  id: string;
  kind: CatalogKind;
  edibility: string;
  lookalikes: unknown[];
};

export function getSpeciesDetail(id: string): SpeciesDetail {
  const m = PNW_CATALOG.find((s) => s.id === id);
  if (m) {
    return {
      kind: "mushroom",
      id: m.id,
      common: m.commonNames,
      scientific: m.scientific,
      family: m.family,
      edibility: m.edibility,
      toxicityNotes: m.toxicityNotes,
      identification: m.identification,
      conditions: m.conditions,
      habitat: m.habitat,
      elevationM: m.elevationM,
      regionsPNW: m.regionsPNW,
      fruitingMonths: m.fruitingMonths,
      peakMonths: m.peakMonths,
      hostTrees: m.hostTrees.slice(0, 6),
      lookalikes: m.lookalikes.map((l) => ({
        name: l.name,
        scientific: l.scientific,
        danger: l.danger,
        distinguishingFeature: l.distinguishingFeature,
        catalogId: l.catalogId ?? null,
      })),
      culinary: m.culinary,
      autoCompiled: m.autoCompiled ?? false,
      sources: m.sources.map((s) => ({ name: s.name, url: s.url })),
    };
  }
  const p = PLANT_CATALOG.find((s) => s.id === id);
  if (p) {
    return {
      kind: "plant",
      id: p.id,
      common: p.commonNames,
      scientific: p.scientific,
      family: p.family,
      edibility: p.edibility,
      edibleParts: p.edibleParts,
      preparation: p.preparation,
      cautions: p.cautions,
      toxicityNotes: p.toxicityNotes,
      identification: p.identification,
      habitat: p.habitat,
      regionsPNW: p.regionsPNW,
      harvestMonths: p.harvestMonths,
      peakMonths: p.peakMonths,
      lookalikes: p.lookalikes.map((l) => ({
        name: l.name,
        scientific: l.scientific,
        danger: l.danger,
        distinguishingFeature: l.distinguishingFeature,
        catalogId: l.catalogId ?? null,
      })),
      culinary: p.culinary,
      sources: p.sources.map((s) => ({ name: s.name, url: s.url })),
    };
  }
  const o = OCEAN_CATALOG.find((s) => s.id === id);
  if (o) {
    return {
      kind: "ocean",
      id: o.id,
      common: o.commonNames,
      scientific: o.scientific,
      group: o.group,
      edibility: o.edibility,
      edibleParts: o.edibleParts,
      preparation: o.preparation,
      cautions: o.cautions,
      biotoxinNotes: o.biotoxinNotes,
      regulations: o.regulations,
      identification: o.identification,
      habitat: o.habitat,
      tidalZone: o.tidalZone,
      bestTide: o.bestTide,
      regionsPNW: o.regionsPNW,
      harvestMonths: o.harvestMonths,
      peakMonths: o.peakMonths,
      lookalikes: o.lookalikes.map((l) => ({
        name: l.name,
        scientific: l.scientific,
        danger: l.danger,
        distinguishingFeature: l.distinguishingFeature,
      })),
      culinary: o.culinary,
      sources: o.sources.map((s) => ({ name: s.name, url: s.url })),
    };
  }
  throw new Error(`No species with id "${id}" in any catalog. Use search_catalog first.`);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/chat/tools.ts scripts/chat.test.mjs
git commit -m "feat(chat): tool schemas + catalog search/detail tools"
```

---

### Task 6: Runtime executors + dispatcher — append to `lib/chat/tools.ts`

Weather, spots, journal executors and the `executeTool` dispatcher with card emission and the 8k cap.

**Files:**
- Modify: `lib/chat/tools.ts` (append)
- Test: `scripts/chat.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

```js
import { capJson, executeTool } from "../lib/chat/tools.ts";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: FAIL — `capJson`/`executeTool` not exported.

- [ ] **Step 3: Append to `lib/chat/tools.ts`**

```ts
import { fetchWeather, computeSporeScore } from "../weather.ts";
import { selectCandidates, scoreCandidates } from "../spot-finder.ts";
import type { JournalEntry } from "../journal.ts";
```

(Note: place these imports at the top of the file with the others — `journal.ts` has a `"use client"` directive, which is inert under node. Only the `JournalEntry` type is imported; the executor reads localStorage itself.)

```ts
export interface ToolContext {
  lat: number | null;
  lon: number | null;
  locationLabel: string;
  regionId: RegionId;
}

export interface ToolCard {
  tool: string;
  data: unknown;
}

export function capJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json.length <= TOOL_RESULT_CAP) return json;
  return json.slice(0, TOOL_RESULT_CAP) + "…[truncated]";
}

async function getWeatherTool(
  input: { lat?: number; lon?: number },
  ctx: ToolContext
) {
  const lat = input.lat ?? ctx.lat;
  const lon = input.lon ?? ctx.lon;
  if (lat == null || lon == null) {
    throw new Error("No coordinates: pass lat/lon or have the user set a location.");
  }
  const days = await fetchWeather(lat, lon);
  const reading = computeSporeScore(days);
  const todayISO = new Date().toISOString().slice(0, 10);
  const idx = Math.max(0, days.findIndex((d) => d.time === todayISO));
  return {
    label: input.lat != null ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : ctx.locationLabel,
    reading,
    outlook: days.slice(idx, idx + 7).map((d) => ({
      date: d.time,
      tempMaxC: d.tempMax,
      tempMinC: d.tempMin,
      rainMm: d.precipitation,
      humidityPct: d.humidity,
    })),
  };
}

async function findSpotsTool(
  input: { maxKm?: number; max?: number },
  ctx: ToolContext
) {
  if (ctx.lat == null || ctx.lon == null) {
    throw new Error("The user has no location set — ask them to pick one on the map first.");
  }
  const candidates = selectCandidates(
    ctx.lat,
    ctx.lon,
    ctx.locationLabel || "here",
    input.maxKm ?? 250,
    Math.min(input.max ?? 6, 10)
  );
  const scored = await scoreCandidates(candidates);
  return scored
    .filter((c) => c.reading)
    .map((c) => ({
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      distanceKm: Number(c.distanceKm.toFixed(1)),
      sporeScore: c.reading!.score,
      rain7dMm: Number(c.reading!.rain7d.toFixed(0)),
      daysSinceRain: c.reading!.daysSinceRain,
    }));
}

function readJournalTool(input: { limit?: number }): unknown[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem("mycelium.journal.v1");
    if (!raw) return [];
    const entries: JournalEntry[] = JSON.parse(raw);
    return entries.slice(0, Math.min(input.limit ?? 10, 25)).map((e) => ({
      date: e.date,
      species: e.species,
      location: e.location,
      notes: e.notes,
      lat: e.lat ?? null,
      lon: e.lon ?? null,
      conditions: e.weather ?? null,
      // photoDataUrl deliberately excluded: huge base64 blobs
    }));
  } catch {
    return [];
  }
}

/**
 * Execute one client tool. Returns a JSON string (≤ TOOL_RESULT_CAP chars) and
 * emits a UI card. Throws on failure — the agent loop converts throws into
 * is_error tool_results.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  onCard: (card: ToolCard) => void
): Promise<string> {
  switch (name) {
    case "search_catalog": {
      const hits = searchCatalog(input as Parameters<typeof searchCatalog>[0]);
      onCard({ tool: "search_catalog", data: hits });
      return capJson(hits);
    }
    case "get_species": {
      const detail = getSpeciesDetail(String(input.id));
      onCard({
        tool: "get_species",
        data: {
          id: detail.id,
          kind: detail.kind,
          common: Array.isArray(detail.common) ? detail.common[0] : detail.common,
          scientific: detail.scientific,
          edibility: detail.edibility,
          thumb:
            detail.kind === "mushroom" && SPECIES_IMAGES[detail.id]?.thumb
              ? localImage(SPECIES_IMAGES[detail.id].thumb)
              : null,
          lookalikes: detail.lookalikes,
        },
      });
      return capJson(detail);
    }
    case "get_weather": {
      const w = await getWeatherTool(input as { lat?: number; lon?: number }, ctx);
      onCard({ tool: "get_weather", data: w });
      return capJson(w);
    }
    case "find_spots": {
      const spots = await findSpotsTool(input as { maxKm?: number; max?: number }, ctx);
      onCard({ tool: "find_spots", data: spots });
      return capJson(spots);
    }
    case "read_journal": {
      const entries = readJournalTool(input as { limit?: number });
      onCard({ tool: "read_journal", data: { count: entries.length } });
      return capJson(entries);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --experimental-strip-types scripts/chat.test.mjs`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/chat/tools.ts scripts/chat.test.mjs
git commit -m "feat(chat): weather/spots/journal executors + tool dispatcher with cards"
```

---

### Task 7: Agent loop — `lib/chat/agent.ts`

The only module that imports the SDK. No node test (network + SDK); verified by typecheck now and manual QA in Task 11.

**Files:**
- Create: `lib/chat/agent.ts`

- [ ] **Step 1: Implement `lib/chat/agent.ts`**

```ts
/**
 * Browser-side streaming tool-use loop. The ONLY chat module that imports
 * @anthropic-ai/sdk — node tests must not import this file.
 *
 * The user's key never leaves the browser: same trust model as spot-finder,
 * via anthropic-dangerous-direct-browser-access (dangerouslyAllowBrowser).
 */
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type ChatContext } from "./prompt.ts";
import {
  TOOL_SCHEMAS,
  WEB_SEARCH_TOOL,
  executeTool,
  type ToolCard,
  type ToolContext,
} from "./tools.ts";
import { safeHref } from "./text.ts";

export const CHAT_MODEL = "claude-sonnet-5";
export const MAX_TOOL_TURNS = 8;

export interface RunCallbacks {
  onTextDelta: (delta: string) => void;
  onToolNote: (toolName: string) => void;
  onCard: (card: ToolCard) => void;
}

export interface RunResult {
  text: string;
  stopReason: string | null;
  /** true when the loop hit MAX_TOOL_TURNS before end_turn */
  exhausted: boolean;
}

interface WebResult {
  title: string;
  url: string;
}

/** Pull sanitized results out of server-side web_search result blocks. */
function extractWebResults(content: Anthropic.ContentBlock[]): WebResult[] {
  const out: WebResult[] = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    const items = (block as { content?: unknown }).content;
    if (!Array.isArray(items)) continue; // error object, not results
    for (const item of items as { type?: string; url?: string; title?: string }[]) {
      if (item.type !== "web_search_result") continue;
      const href = typeof item.url === "string" ? safeHref(item.url) : null;
      if (href) out.push({ title: item.title ?? href, url: href });
    }
  }
  return out;
}

export async function runChatTurn(opts: {
  apiKey: string;
  /** Full conversation for this request, ending with the new user message. */
  messages: Anthropic.MessageParam[];
  context: ChatContext;
  toolContext: ToolContext;
  signal: AbortSignal;
  callbacks: RunCallbacks;
}): Promise<RunResult> {
  const { apiKey, messages, context, toolContext, signal, callbacks } = opts;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const { staticText, dynamicText } = buildSystemPrompt(context);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: staticText, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicText },
  ];
  const tools = [
    ...TOOL_SCHEMAS,
    WEB_SEARCH_TOOL,
  ] as Anthropic.Messages.ToolUnion[];

  let text = "";
  let stopReason: string | null = null;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const stream = client.messages.stream(
      {
        model: CHAT_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system,
        tools,
        messages,
      },
      { signal }
    );
    stream.on("text", (delta) => {
      text += delta;
      callbacks.onTextDelta(delta);
    });

    const msg = await stream.finalMessage();
    stopReason = msg.stop_reason;
    messages.push({ role: "assistant", content: msg.content });

    const webResults = extractWebResults(msg.content);
    if (webResults.length > 0) {
      callbacks.onCard({ tool: "web_search", data: webResults });
    }

    if (msg.stop_reason === "pause_turn") continue; // server tool resumes

    if (msg.stop_reason !== "tool_use") {
      return { text, stopReason, exhausted: false };
    }

    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    for (const t of toolUses) callbacks.onToolNote(t.name);

    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (t) => {
        try {
          const out = await executeTool(
            t.name,
            (t.input ?? {}) as Record<string, unknown>,
            toolContext,
            callbacks.onCard
          );
          return { type: "tool_result" as const, tool_use_id: t.id, content: out };
        } catch (err) {
          return {
            type: "tool_result" as const,
            tool_use_id: t.id,
            content: err instanceof Error ? err.message : "tool failed",
            is_error: true,
          };
        }
      })
    );
    messages.push({ role: "user", content: results });
  }

  return { text, stopReason, exhausted: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If the SDK's `ToolUnion` name differs in the installed version, the compiler will say so — fix the cast to whatever the SDK exports for the `tools` array element type rather than suppressing.)

- [ ] **Step 3: Commit**

```bash
git add lib/chat/agent.ts
git commit -m "feat(chat): streaming tool-use loop with web_search cards and abort"
```

---

### Task 8: Safe markdown renderer — `components/chat/chat-markdown.tsx`

**Files:**
- Create: `components/chat/chat-markdown.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import Link from "next/link";
import { parseInline } from "@/lib/chat/text.ts";
import { PNW_CATALOG } from "@/lib/species-catalog.ts";
import { PLANT_CATALOG } from "@/lib/plant-catalog.ts";
import { OCEAN_CATALOG } from "@/lib/ocean-catalog.ts";

function speciesRoute(id: string): { href: string; label: string } | null {
  const m = PNW_CATALOG.find((s) => s.id === id);
  if (m) return { href: `/catalog/${id}`, label: m.commonNames[0] };
  if (PLANT_CATALOG.some((s) => s.id === id)) return { href: `/plants#${id}`, label: id };
  if (OCEAN_CATALOG.some((s) => s.id === id)) return { href: `/ocean#${id}`, label: id };
  return null;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) => {
        if (p.kind === "bold") return <strong key={i}>{p.text}</strong>;
        if (p.kind === "link")
          return (
            <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--rust)" }}>
              {p.text}
            </a>
          );
        if (p.kind === "species") {
          const route = speciesRoute(p.id);
          if (!route) return null; // invented/unknown id → render nothing
          return (
            <Link
              key={i}
              href={route.href}
              className="mx-0.5 inline-block rounded-full border px-2 py-0.5 font-mono text-[11px]"
              style={{ borderColor: "var(--line)", color: "var(--rust)" }}
            >
              {route.label} ↗
            </Link>
          );
        }
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

/** Minimal, safe markdown: paragraphs, bullets, ###-headings. No innerHTML. */
export default function ChatMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === "");
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines
                .filter((l) => l.trim())
                .map((l, li) => (
                  <li key={li}>
                    <Inline text={l.replace(/^\s*[-*]\s+/, "")} />
                  </li>
                ))}
            </ul>
          );
        }
        const h = block.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          return (
            <p key={bi} className="pt-1 font-semibold">
              <Inline text={h[2]} />
            </p>
          );
        }
        return (
          <p key={bi}>
            <Inline text={block} />
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/chat-markdown.tsx
git commit -m "feat(chat): hand-rolled safe markdown renderer with species chips"
```

---

### Task 9: Cards — `components/chat/chat-cards.tsx`

**Files:**
- Create: `components/chat/chat-cards.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import Link from "next/link";
import type { ChatCard } from "@/lib/chat/store.ts";
import { safeHref } from "@/lib/chat/text.ts";

const DANGER_COLORS: Record<string, string> = {
  deadly: "#8b1a1a",
  toxic: "#b4541e",
};

function edibilityBadge(edibility: string) {
  const danger = edibility === "deadly" || edibility === "toxic";
  return (
    <span
      className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
      style={{
        borderColor: danger ? DANGER_COLORS[edibility] : "var(--line)",
        color: danger ? DANGER_COLORS[edibility] : "var(--ink-soft)",
      }}
    >
      {edibility}
    </span>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "rgba(255,255,255,0.5)" }}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

interface Hit {
  id: string;
  kind: string;
  common: string;
  scientific: string;
  edibility: string;
  thumb: string | null;
}

function speciesHref(hit: { id: string; kind: string }): string {
  if (hit.kind === "mushroom") return `/catalog/${hit.id}`;
  if (hit.kind === "plant") return `/plants#${hit.id}`;
  return `/ocean#${hit.id}`;
}

function SpeciesRow({ hit }: { hit: Hit }) {
  return (
    <Link href={speciesHref(hit)} className="flex items-center gap-2 py-1.5">
      {hit.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hit.thumb} alt="" className="h-9 w-9 rounded object-cover" />
      ) : (
        <span className="h-9 w-9 rounded" style={{ background: "var(--line)" }} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{hit.common}</span>
        <span className="block truncate text-xs italic" style={{ color: "var(--ink-soft)" }}>
          {hit.scientific}
        </span>
      </span>
      {edibilityBadge(hit.edibility)}
    </Link>
  );
}

function SearchCard({ data }: { data: Hit[] }) {
  if (!data.length) return null;
  return (
    <Shell title="Catalog results">
      <div className="divide-y" style={{ borderColor: "var(--line)" }}>
        {data.slice(0, 8).map((h) => (
          <SpeciesRow key={h.id} hit={h} />
        ))}
      </div>
    </Shell>
  );
}

interface SpeciesCardData extends Hit {
  lookalikes: { name: string; danger: string; catalogId?: string | null }[];
}

function SpeciesCard({ data }: { data: SpeciesCardData }) {
  const dangerous = data.lookalikes.filter((l) => l.danger === "deadly" || l.danger === "toxic");
  return (
    <Shell title="Species">
      <SpeciesRow hit={data} />
      {dangerous.length > 0 && (
        <div className="mt-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: DANGER_COLORS.toxic }}>
          <span className="font-semibold">Dangerous lookalikes: </span>
          {dangerous.map((l, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {l.catalogId ? (
                <Link href={`/catalog/${l.catalogId}`} className="underline">
                  {l.name}
                </Link>
              ) : (
                l.name
              )}{" "}
              ({l.danger})
            </span>
          ))}
        </div>
      )}
    </Shell>
  );
}

interface WeatherData {
  label: string;
  reading: { score: number; label: string; rain7d: number; daysSinceRain: number; tempToday: number; humidityToday: number };
  outlook: { date: string; tempMaxC: number; tempMinC: number; rainMm: number }[];
}

function WeatherCard({ data }: { data: WeatherData }) {
  return (
    <Shell title={`Conditions · ${data.label}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{data.reading.score}</span>
        <span className="text-sm">{data.reading.label}</span>
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
        {data.reading.rain7d.toFixed(0)}mm rain / 7d · day {data.reading.daysSinceRain} since rain ·{" "}
        {data.reading.tempToday.toFixed(0)}°C · {data.reading.humidityToday.toFixed(0)}% RH
      </div>
    </Shell>
  );
}

interface Spot {
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  sporeScore: number;
}

function SpotsCard({ data }: { data: Spot[] }) {
  if (!data.length) return null;
  return (
    <Shell title="Nearby spots">
      {data.slice(0, 6).map((s) => (
        <div key={s.name} className="flex items-center justify-between py-1 text-sm">
          <Link href="/map" className="truncate underline decoration-dotted">
            {s.name}
          </Link>
          <span className="ml-2 shrink-0 font-mono text-xs" style={{ color: "var(--ink-soft)" }}>
            {s.distanceKm}km · score {s.sporeScore}
          </span>
        </div>
      ))}
    </Shell>
  );
}

function WebCard({ data }: { data: { title: string; url: string }[] }) {
  const items = data.map((r) => ({ ...r, href: safeHref(r.url) })).filter((r) => r.href);
  if (!items.length) return null;
  return (
    <Shell title="From the web · not Foray-verified">
      {items.slice(0, 8).map((r, i) => (
        <a key={i} href={r.href!} target="_blank" rel="noopener noreferrer" className="block truncate py-1 text-sm underline">
          {r.title}
        </a>
      ))}
    </Shell>
  );
}

export default function ChatCardView({ card }: { card: ChatCard }) {
  switch (card.tool) {
    case "search_catalog":
      return <SearchCard data={card.data as Hit[]} />;
    case "get_species":
      return <SpeciesCard data={card.data as SpeciesCardData} />;
    case "get_weather":
      return <WeatherCard data={card.data as WeatherData} />;
    case "find_spots":
      return <SpotsCard data={card.data as Spot[]} />;
    case "web_search":
      return <WebCard data={card.data as { title: string; url: string }[]} />;
    default:
      return null; // unknown tools render nothing (forward-compatible, Keeper's pattern)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/chat-cards.tsx
git commit -m "feat(chat): typed tool-result cards (species/weather/spots/web)"
```

---

### Task 10: Chat panel, page, and nav wiring

**Files:**
- Create: `components/chat/chat-panel.tsx`
- Create: `app/chat/page.tsx`
- Modify: `components/tab-bar.tsx` (add Ask tab; `grid-cols-5` → `grid-cols-6`)
- Modify: `components/side-nav.tsx` (add `{ href: "/chat", label: "Ask" }` to its nav array)

- [ ] **Step 1: Implement `components/chat/chat-panel.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";
import { useLocation } from "@/lib/location-context";
import { useRegion } from "@/lib/region-context";
import { useOnline } from "@/lib/use-online";
import ApiKeyDialog from "@/components/api-key-dialog";
import ChatMarkdown from "@/components/chat/chat-markdown";
import ChatCardView from "@/components/chat/chat-cards";
import { runChatTurn, MAX_TOOL_TURNS } from "@/lib/chat/agent.ts";
import {
  createSession,
  loadSessions,
  saveSessions,
  turnsToMessages,
  type ChatCard,
  type ChatSession,
  type ChatTurn,
} from "@/lib/chat/store.ts";
import { SAFETY_DISCLAIMER } from "@/lib/chat/prompt.ts";

const SUGGESTED = [
  "What's fruiting near me this week?",
  "How do I tell a matsutake from its dangerous lookalikes?",
  "Where should I forage this weekend?",
  "What did I find last fall?",
];

const TOOL_LABEL: Record<string, string> = {
  search_catalog: "Searching the catalog…",
  get_species: "Reading the field guide…",
  get_weather: "Checking conditions…",
  find_spots: "Scoring nearby spots…",
  read_journal: "Reading your journal…",
  web_search: "Searching the web…",
};

type View = "chat" | "history";

export default function ChatPanel() {
  const { apiKey, hasKey, loaded } = useApiKey();
  const { lat, lon, label: locationLabel } = useLocation();
  const { def: regionDef } = useRegion();
  const online = useOnline();

  const [view, setView] = useState<View>("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [active, setActive] = useState<ChatSession | null>(null); // null = fresh screen
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamCards, setStreamCards] = useState<ChatCard[]>([]);
  const [toolNote, setToolNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSessions(loadSessions()), []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.turns.length, streamText, streamCards.length]);

  function persist(next: ChatSession) {
    setActive(next);
    setSessions((prev) => {
      const merged = [next, ...prev.filter((s) => s.id !== next.id)];
      saveSessions(merged);
      return merged;
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || !apiKey) return;
    setError(null);
    setInput("");

    // Lazy session creation (Keeper pattern)
    const base = active ?? createSession(trimmed);
    const userTurn: ChatTurn = { role: "user", text: trimmed };
    const withUser: ChatSession = {
      ...base,
      updatedAt: new Date().toISOString(),
      turns: [...base.turns, userTurn],
    };
    persist(withUser);

    setSending(true);
    setStreamText("");
    setStreamCards([]);
    const cards: ChatCard[] = [];
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runChatTurn({
        apiKey,
        messages: turnsToMessages(withUser.turns),
        context: {
          todayISO: new Date().toISOString().slice(0, 10),
          regionLabel: regionDef.label,
          locationLabel,
          lat,
          lon,
        },
        toolContext: { lat, lon, locationLabel, regionId: regionDef.id },
        signal: controller.signal,
        callbacks: {
          onTextDelta: (d) => setStreamText((t) => t + d),
          onToolNote: (name) => setToolNote(TOOL_LABEL[name] ?? "Working…"),
          onCard: (c) => {
            cards.push(c);
            setStreamCards([...cards]);
          },
        },
      });

      let finalText = result.text;
      if (result.stopReason === "refusal") {
        finalText = finalText || "Claude declined this request.";
      } else if (result.exhausted) {
        finalText += `\n\n_(stopped after ${MAX_TOOL_TURNS} tool rounds)_`;
      } else if (result.stopReason === "max_tokens") {
        finalText += "\n\n_(response truncated)_";
      }
      persist({
        ...withUser,
        updatedAt: new Date().toISOString(),
        turns: [...withUser.turns, { role: "assistant", text: finalText, cards }],
      });
    } catch (err: unknown) {
      const anyErr = err as { name?: string; status?: number; message?: string };
      if (anyErr.name === "APIUserAbortError") {
        persist({
          ...withUser,
          updatedAt: new Date().toISOString(),
          turns: [
            ...withUser.turns,
            { role: "assistant", text: streamTextRefSafe(), cards, stopped: true },
          ],
        });
      } else if (anyErr.status === 401) {
        setError("Your API key was rejected — check it in Settings.");
        setKeyDialogOpen(true);
      } else if (anyErr.status === 429) {
        setError("Rate limited by the API — wait a minute and try again.");
      } else {
        setError(anyErr.message ?? "Something went wrong.");
      }
    } finally {
      setSending(false);
      setToolNote(null);
      setStreamText("");
      setStreamCards([]);
      abortRef.current = null;
    }

    // React state isn't readable synchronously after abort; snapshot helper:
    function streamTextRefSafe() {
      let snapshot = "";
      setStreamText((t) => {
        snapshot = t;
        return t;
      });
      return snapshot ? `${snapshot}\n\n_(stopped)_` : "_(stopped)_";
    }
  }

  if (!loaded) return null;

  if (!hasKey) {
    return (
      <div className="p-6 text-center">
        <p className="mb-3 text-sm">
          Ask needs your Anthropic API key (stored only in this browser, same as the spot finder).
        </p>
        <button
          className="rounded border px-4 py-2 text-sm"
          style={{ borderColor: "var(--line)" }}
          onClick={() => setKeyDialogOpen(true)}
        >
          Add API key
        </button>
        <ApiKeyDialog open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} />
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">History</h2>
          <button className="text-sm underline" onClick={() => setView("chat")}>
            Back
          </button>
        </div>
        {sessions.length === 0 && <p className="text-sm">No conversations yet.</p>}
        {sessions.map((s) => (
          <button
            key={s.id}
            className="block w-full border-b py-2 text-left"
            style={{ borderColor: "var(--line)" }}
            onClick={() => {
              setActive(s);
              setView("chat");
            }}
          >
            <span className="block truncate text-sm">{s.title}</span>
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {s.turns.length} messages · {s.updatedAt.slice(0, 10)}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>
        <h2 className="font-semibold">Ask</h2>
        <div className="flex gap-3 text-sm">
          <button className="underline" onClick={() => setActive(null)} disabled={sending}>
            New chat
          </button>
          <button className="underline" onClick={() => setView("history")} disabled={sending}>
            History
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!active && !sending && (
          <div className="space-y-2 pt-6">
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Grounded in Foray's catalog, weather, and your journal. {SAFETY_DISCLAIMER}
            </p>
            {SUGGESTED.map((s) => (
              <button
                key={s}
                className="block w-full rounded border px-3 py-2 text-left text-sm"
                style={{ borderColor: "var(--line)" }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {active?.turns.map((t, i) => (
          <div key={i} className={`mb-3 ${t.role === "user" ? "text-right" : ""}`}>
            {t.role === "user" ? (
              <span className="inline-block rounded-lg px-3 py-2 text-sm" style={{ background: "var(--line)" }}>
                {t.text}
              </span>
            ) : (
              <div className="space-y-2">
                {t.cards?.map((c, ci) => <ChatCardView key={ci} card={c} />)}
                <ChatMarkdown text={t.text} />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="space-y-2">
            {streamCards.map((c, ci) => (
              <ChatCardView key={ci} card={c} />
            ))}
            {streamText && <ChatMarkdown text={streamText} />}
            {toolNote && (
              <p className="animate-pulse font-mono text-xs" style={{ color: "var(--ink-soft)" }}>
                {toolNote}
              </p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--line)" }}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--line)", background: "transparent" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder={online ? "Ask about species, conditions, spots…" : "Offline — Ask needs a connection"}
          disabled={!online || sending}
        />
        {sending ? (
          <button
            type="button"
            className="rounded border px-4 text-sm"
            style={{ borderColor: "var(--line)" }}
            onClick={() => abortRef.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            className="rounded border px-4 text-sm"
            style={{ borderColor: "var(--line)" }}
            disabled={!online || !input.trim()}
          >
            Send
          </button>
        )}
      </form>
      <ApiKeyDialog open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Implement `app/chat/page.tsx`**

```tsx
import type { Metadata } from "next";
import ChatPanel from "@/components/chat/chat-panel";

export const metadata: Metadata = {
  title: "Ask — Foray",
  description: "Chat with a field-guide assistant grounded in Foray's catalog.",
};

export default function ChatPage() {
  return (
    <main className="mx-auto flex h-[calc(100dvh-120px)] max-w-[720px] flex-col">
      <ChatPanel />
    </main>
  );
}
```

(Adjust the height offset to match how other pages account for the tab bar — check `app/journal/page.tsx` for the container conventions and copy them.)

- [ ] **Step 3: Wire navigation**

In `components/tab-bar.tsx`:
1. Add to the `tabs` array (after Journal): `{ href: "/chat", label: "Ask", icon: AskIcon },`
2. Change `grid-cols-5` to `grid-cols-6`.
3. Add an icon component next to the existing ones (match their prop signature — they take `{ active }`):

```tsx
function AskIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5}>
      <path d="M21 12a8 8 0 1 1-3.1-6.3L21 4l-1 3.4A8 8 0 0 1 21 12z" strokeLinejoin="round" />
      <circle cx="9" cy="12" r="0.8" fill="currentColor" />
      <circle cx="12.5" cy="12" r="0.8" fill="currentColor" />
      <circle cx="16" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}
```

In `components/side-nav.tsx`: add `{ href: "/chat", label: "Ask" },` to its nav array (after Journal).

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add components/chat/chat-panel.tsx app/chat/page.tsx components/tab-bar.tsx components/side-nav.tsx
git commit -m "feat(chat): Ask page — panel, sessions UX, nav entries"
```

---

### Task 11: Verification

- [ ] **Step 1: Full automated pass**

```bash
npm test && npx tsc --noEmit && npm run build
```

Expected: all tests pass (including the pre-existing guard suites — none should be touched by this work), typecheck clean, static build succeeds and `out/chat/index.html` exists (`ls out/chat/`).

- [ ] **Step 2: Manual QA on the dev server**

```bash
npm run dev   # http://localhost:1245
```

Walk through, with a real API key set in Settings:
1. `/chat` shows the fresh compose screen with suggested prompts; no session is created until first send.
2. Ask "How do I tell a matsutake from its dangerous lookalikes?" → expect `search_catalog`/`get_species` tool notes, a species card with a dangerous-lookalikes strip, `[[species:…]]` chips resolving to `/catalog/...`, and the safety disclaimer at the end.
3. Ask "What's fruiting near me this week?" → weather card with Spore Score.
4. Hit Stop mid-stream → partial text kept, marked "(stopped)".
5. Reload → History shows the conversation; reopening it restores text + cards.
6. DevTools → Network: confirm the only `api.anthropic.com` calls carry the user key header and `usage.cache_read_input_tokens` becomes non-zero from the second turn (prompt cache working).
7. Remove the API key → page shows the key CTA. DevTools offline mode → composer disabled.

- [ ] **Step 3: Report**

Summarize results to the maintainer. Do NOT push — the maintainer pushes and deploys themselves.

---

## Self-review notes (already applied)

- **Spec coverage:** prompt/safety (Task 2), citations + safe rendering (Tasks 3, 8), sessions (Task 4, 10), tools + caps + cards (Tasks 5, 6, 9), loop/streaming/abort/web_search (Task 7), UI/gating/nav (Task 10), errors (Tasks 7, 10), tests (Tasks 2–6), build/QA (Task 11). Out-of-scope items from the spec have no tasks, as intended.
- **Type consistency:** `ChatCard`/`ToolCard` are structurally identical (`{tool, data}`) — `ToolCard` in `lib/chat/tools.ts` (SDK-free layer), `ChatCard` in the store; the panel passes them interchangeably by shape.
- The panel's `streamTextRefSafe` trick exists because the abort catch-block can't read the latest `streamText` state directly; it snapshots via the updater. Keep it — replacing it with a ref is fine too if the implementer prefers.
