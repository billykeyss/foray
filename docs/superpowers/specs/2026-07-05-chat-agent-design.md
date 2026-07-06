# Foray Chat Agent — Design

**Date:** 2026-07-05
**Status:** Approved (design review with maintainer)
**Reference:** Keeper's chat agent (`~/projects/fishing-law`, `src/chat/*` + `web/src/ChatPanel.tsx`), adapted to Foray's static-export/no-backend constraint.

## Goal

A conversational field-guide assistant at `/chat` ("Ask") with capability parity with Keeper's chat: a multi-turn Claude tool-use loop over Foray's domain data (catalog, weather, spots, journal), streaming answers with structured cards, strict tool-grounded citations, session history, and hard safety rules for edibility questions.

## Constraints that shape the design

- **No backend.** Foray is a Next.js static export. The agent loop runs **in the browser**, calling `api.anthropic.com` directly with the user's own key (`anthropic-dangerous-direct-browser-access`), exactly like the existing spot-finder. Keeper's server-side pieces (password gate, per-IP rate limits, Postgres persistence, Claude Agent SDK subprocess) translate to: API-key gate, no rate limiting needed (user pays own key), localStorage persistence, and the browser build of `@anthropic-ai/sdk`.
- **Data is already client-side.** Tools are plain functions over bundled modules (`PNW_CATALOG`, plant/ocean catalogs, `fetchWeather`/`computeSporeScore`, spot-finder candidates, journal in localStorage).
- **Node-testability.** All non-UI chat modules live in `lib/chat/*.ts` with no JSX and explicit `.ts` import extensions so `node --experimental-strip-types` tests can import them (same convention as `lib/regions.ts`).

## Architecture

### Agent core — `lib/chat/agent.ts`

- **SDK:** `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, key from the existing `ApiKeyProvider` (`foray.anthropic-key.v1`). The only new runtime dependency.
- **Model:** `claude-sonnet-5` (constant `CHAT_MODEL`), `thinking: {type: "adaptive"}`, `max_tokens: 16000`. (Decision: maintainer chose Sonnet 5 over Keeper's Haiku 4.5 — edibility reasoning is safety-sensitive — and over Opus 4.8 for end-user cost.)
- **Loop:** streaming manual tool-use loop (`client.messages.stream()` + `finalMessage()`):
  1. Stream a turn; forward text deltas to the UI.
  2. `stop_reason === "tool_use"` → execute all requested client tools in parallel, append the full `response.content` (preserves thinking blocks) plus one user message containing all `tool_result` blocks; continue.
  3. `stop_reason === "pause_turn"` (server-side web_search) → append assistant content and re-send to resume.
  4. `end_turn` → done. Hard cap **`MAX_TOOL_TURNS = 8`** (Keeper's number); on cap, finish with whatever text exists plus a "stopped early" notice.
- **Abort:** an `AbortController` per send, wired to a visible Stop button (improvement over Keeper, which only aborts on disconnect).
- **Caching:** static system prompt (persona + rules) is one system block with `cache_control: {type: "ephemeral"}`; volatile context (date, region, location, units) is a second, uncached system block after it. Tool definitions are a frozen module-level array (stable order) so tools+system cache as a prefix.
- **Context window:** only the last **12 display turns** are sent per request. Within a live turn, in-memory messages carry full content blocks; a session restored from localStorage rebuilds context as plain text turns (user/assistant text only, no stale tool/thinking blocks).

### Tools — `lib/chat/tools.ts`

Five client tools (executors return JSON strings, capped at **8000 chars** each) plus one server tool. All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `search_catalog` | `query?`, `kind?` (mushroom/plant/ocean), `edibility?`, `month?`, `region?`, `hostTree?`, `limit≤10` | Compact records: id, common/scientific name, edibility, fruiting months. Searches `PNW_CATALOG` + plant/ocean catalogs. |
| `get_species` | `id` | Full record for any kind. Mushrooms: identification, conditions, edibility + notes, lookalikes **with danger levels and their `catalogId`s**, sources. Plants/ocean: the kind-appropriate fields from their own types (id features, edibility/regulations, cautions). |
| `get_weather` | `lat?`/`lon?` (defaults to user location) | 7-day Open-Meteo outlook + computed Spore Score (reuses `lib/weather.ts`). |
| `find_spots` | `maxKm?`, `max?` | The deterministic half of spot-finder: `selectCandidates` + `scoreCandidates` → scored nearby spots. |
| `read_journal` | `limit?` | The user's journal entries (localStorage), newest first. |
| `web_search` | server tool `{type: "web_search_20260209", name: "web_search", max_uses: 3}` | Fallback only, per system-prompt ordering rule; results flagged as unverified. |

Each client-tool execution also emits a typed **card event** to the UI (see Cards). Tool errors return `tool_result` with `is_error: true` (never throw out of the loop).

### System prompt — `lib/chat/prompt.ts`

`buildSystemPrompt()` returns `{static, dynamic}` blocks.

Static (cached) — persona: "You are Foray's foraging field-guide assistant." Rules, mirroring Keeper's:

- **Tool ordering:** answer species/edibility/conditions questions ONLY from tool results, never memory. Catalog first; `web_search` only when catalog + weather tools have no answer, and any web-sourced content must begin with the literal prefix `From a web search (not Foray's verified catalog):`.
- **Safety (the load-bearing section):** never confirm a mushroom is safe to eat from chat alone; always surface dangerous lookalikes returned by `get_species` (name + danger); edibility claims must quote the catalog's `edibility` field verbatim; recommend physical verification (spore print, local expert / mycological society). Every answer that touches edibility or identification **must end with**: `Never eat a wild find based on this chat alone — physically verify the ID first (for mushrooms, that means a spore print and a local expert).` (Domain-neutral — code review flagged that a mushroom-only disclaimer contradicts the plant/ocean scope; verification advice is kind-aware.)
- **Citations:** species references use `[[species:<id>]]` tokens, only for ids seen in tool results this conversation — never invented. Web facts cite inline markdown links whose URLs came from web_search results this conversation — never recalled URLs. No markdown tables (cards carry structure).

Dynamic (uncached): today's date, active region label, user location label, units.

### Cards & rendering

- **Cards** (Keeper's pattern): tool executors emit `{tool, data}` events rendered above the prose of the assistant turn, and persisted with the session so reopened chats keep them.
  - `search_catalog` → species-list card (thumb, name, edibility badge, link to `/catalog/[id]`).
  - `get_species` → single species card (photo via existing `species-photo` patterns, edibility badge, dangerous-lookalike strip reusing `lookalike-card` styling).
  - `get_weather` → spore-score card (gauge style from `spore-gauge`).
  - `find_spots` → ranked-spots card (name, distance, score; links to map).
  - `web_search` → web card labeled "From the web · not Foray-verified", links sanitized.
- **Markdown:** hand-rolled minimal renderer (`components/chat/chat-markdown.tsx`) building React nodes — paragraphs, bullets, bold, `http(s)`-only links, `[[species:id]]` → internal chip linking `/catalog/[id]`. **No `dangerouslySetInnerHTML`, no markdown library.** `safeHref()` (`/^https?:\/\//i`) guards every external href (Keeper's three-layer fix, collapsed to the two layers we have).

### UI — `app/chat/page.tsx` + `components/chat/`

- **Entry:** "Ask" item in side-nav and tab bar. Page gated like spot-finder: no key → key CTA (existing `api-key-dialog`); offline → composer disabled with the offline banner (`use-online`).
- **Keeper session UX:** opens on a fresh compose screen with suggested prompts (e.g. "What's fruiting near me this week?", "How do I tell a matsutake from a Smith's amanita?", "Where should I forage this weekend?"); **History behind a button**; sessions created lazily on first send.
- **Chat screen:** message list (cards above prose per assistant turn), streaming text, tool-activity notes via a `TOOL_LABEL` map ("Searching catalog…", "Checking weather…", "Searching the web…"), composer (`maxLength=2000`), Send disabled while a reply is in flight (in-flight guard), Stop button during streaming, New-chat button.

### Persistence — `lib/chat/store.ts`

localStorage under `foray.chat.sessions.v1`: `{id, title (first user message, truncated), createdAt, updatedAt, turns: [{role, text, cards?}]}`. Capped at **30 sessions**, oldest pruned. No persisted active-session id — the panel deliberately opens on a fresh compose screen (Keeper UX); reopening a past session goes through History. Quota-safe writes (try/catch like the rest of the app).

### Errors & edge cases

- Typed SDK errors → friendly UI: `AuthenticationError` → "check your API key" + open key dialog; `RateLimitError`/`InternalServerError`/529 → retry hint; `APIConnectionError` → offline hint.
- `stop_reason === "refusal"` → render a "Claude declined this request" notice (no retry).
- `max_tokens` → show partial text + notice.
- Mid-stream abort → keep partial text, mark turn "(stopped)".

### Testing

`scripts/chat.test.mjs` (node:test, existing convention):

- `search_catalog` filtering (kind/edibility/month/region), result caps, id integrity against `PNW_CATALOG`.
- `buildSystemPrompt` contains the safety disclaimer, web-prefix rule, and citation rule strings.
- Session store: prune-at-30, lazy creation semantics, corrupt-JSON recovery.
- `[[species:id]]` token parser + `safeHref` (rejects `javascript:`/`data:`).

Plus `npx tsc --noEmit`, `npm run build`, and the existing guard suites unchanged.

## Out of scope (v1)

- Photo-based identification (vision) — compelling but safety-sensitive; own design later.
- Migrating spot-finder onto the agent loop.
- Model picker in Settings (constant is trivial to lift later).
- Any service-worker changes — `api.anthropic.com` is already NetworkOnly; the `/chat` HTML is precached automatically by `build-sw`.

## Dependency delta

`@anthropic-ai/sdk` only, imported solely by `/chat`-route modules (code-split by Next).
