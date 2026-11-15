# Foray + Keeper: one app, map home — design

Date: 2026-11-15 · Status: approved 2026-11-15

## Intent

The maintainer forages and fishes on the same trips. Today that means two apps:
**Foray** (mushroom/plant field guide, fruiting forecast, forage map, journal, AI spot-finder)
and **Keeper** (CA/NV fishing regulations on a map, stocking history, rules chat). They want
one app where the **map is home** and a single glance answers "is today good for foraging,
and what can I fish near here?"

Mockups (option B was picked): https://claude.ai/artifact/7jJYmSc13ngEKEKJQmRE6A

## Goals

- One app, built on Foray's codebase, with Keeper's fishing data and features folded in.
- Home screen = a satellite map (top) + a **Today's trip card** (bottom) showing forage and
  fish side by side for the current location.
- Satellite imagery with 3D terrain and a tilt toggle, in the spirit of Sesh's climbing map.
- Fishing rules work **offline**, like the rest of Foray (no signal at lakes and in forest).

## Non-goals

- Merging into Sesh (decided: separate app; climbing isn't part of these trips).
- Moving Keeper's research/verification pipeline. Keeper's repo stays the source of truth
  for fishing data; Foray consumes an export.
- Retiring Keeper's own deployment. That's a later decision.
- New regions or new fishing data beyond what Keeper already has (CA/NV).

## Anti-goals (failure even if it "works")

- A fishing rule shown without its date, citation, or the "verify with the agency / not legal
  advice" framing Keeper has today, or a `verifyCurrent` water missing its banner.
- A status stamp (OPEN / CLOSED / C&R) that's wrong because rules weren't resolved for
  *today's* date on the device.
- Weakening Foray's mushroom safety gates (review gate, lookalike danger reconciliation).
- Losing offline: the app must still open and show the guide and rules with no network.
- A home screen that feels like two apps stapled together (two toggles, two search boxes,
  two chats).

## Constraints (from the code today)

- Foray is a Next.js 15 static export (`out/`) served by a small Hono server on the Mac mini
  (`server/index.ts`, `:4245`, tunnel to foray.billhuang.me). The server also hosts the
  password-gated Anthropic chat proxy. Autodeploy rebuilds on push to `main`.
- Foray data is compiled into TS modules; offline is a serwist service worker with an
  opt-in photo download.
- Foray's map is Leaflet (`components/forage-map.tsx`, `app/map/page.tsx`), with an Esri /
  USGS basemap and a Topo/Satellite switch (commit e3d8213).
- Keeper's data is committed JSON: `~/projects/keeper/data/{corridor,california,nevada}/*.json`
  (~776 waters, ~9 MB), one file per water with `water`, `authorities`, `reaches`, `species`,
  `speciesGroups`, `regulations` (typed `parameters` + `citation`), `stockingEvents`,
  `stockingSchedule`. Keeper loads it into PostGIS, but nothing Foray needs requires the DB.
- Keeper's `src/resolver/dateSpec.ts` is pure TS, but it only turns a DateSpec into a date.
  The real OPEN / CLOSED / C&R logic (`deriveStatus`, plus `src/api/season.ts`) lives in
  `src/api/rules.ts`, mixed in with Drizzle/PostGIS queries, and has subtle cases (e.g. an
  unrelated C&R protection bag at Pyramid Lake must not downgrade a keepable fishery).
  Parameter validators are Zod (`src/params/`).
- Keeper's web app (Vite/React/MapLibre) has the rule UI to port: `RuleCard`, `RulesSheet`,
  `StatusPill` (rubber-stamp statuses), `ruleFormat.ts`, `StockingPage`, `LayersPanel`
  (National Forest + BLM tile overlays, fish filter), `WaterSearch`, URL deep links.
- Keeper's chat runs the Claude Agent SDK server-side with a `keeper` MCP toolset
  (`src/chat/mcp.ts`).

## Approaches considered

1. **Fold Keeper into Foray, rules on the phone. (Picked.)** Export Keeper's JSON into Foray
   at build time, port the resolver, and resolve rules locally. Offline works for everything.
   Costs: the most porting, and fishing data updates need a re-export and rebuild.
2. **Foray as shell, Keeper's API stays.** Foray's map calls Keeper's Hono/PostGIS API live.
   Faster, one copy of the data, but no fishing rules offline and a hard dependency on the
   Keeper server. Rejected because offline at the water matters.
3. **Merge into Sesh.** Rejected by the maintainer: different stack (React Router + Mapbox +
   Postgres), climbing-centric navigation, biggest port.

## The design

### Navigation

Four tabs: **Map · Guide · Journal · Ask** (bottom bar on phone, side nav on desktop as now).
- **Map** (home, `/`): satellite map + Today's trip card (below).
- **Guide**: today's catalog, trees, plants, ocean segmented control, plus a new **Fish**
  segment: waters list/search and the statewide stocking feed (port of `StockingPage`).
- **Journal**: unchanged.
- **Ask**: one chat (see AI below).
- The current Today page and the Charts tab go away as tabs. Their content moves into the trip
  card's expanded state (spore gauge, forecast strip, charts). *(My call.)*

### Map home layout (option B)

- Top bar: location chip ("Truckee · 5,900 ft", opens Foray's existing `LocationChooser`) with
  temperature + next rain, and a search button (one search across species and waters).
- Right-side map controls: Layers, 3D tilt, locate.
- Map pins: amber circles = forage spots/suggestions; blue squares = waters (reaches drawn as
  lines where Keeper has geometry, as Keeper does today). Tapping a water opens the rules sheet;
  tapping a forage pin opens Foray's existing spot/species detail.
- **Today's trip card**, a bottom sheet, peeked at about half the screen:
  - Kicker: "TODAY'S TRIP · <date>", plus a one-line headline built from the two scores
    (e.g. "Good to fish, fair to forage"). The wording rules are the builder's, but they must
    come from real computed values.
  - **Forage half**: the fruiting score (Foray's `computeSporeScore`) and the top 3 in-season
    species for this location/region (existing `suggestSpecies`/`scoreSpecies`).
  - **Fish half**: the 3 nearest waters with today's resolved status stamp
    (OPEN / CLOSED / C&R / unknown, using Keeper's stamp styles).
  - CTA: "Plan a spot with AI", which opens the existing spot-finder.
  - Dragging the sheet up shows the full forecast detail (former Today page + charts).

### Map engine

Replace Leaflet with **MapLibre GL** (Keeper already uses it; no token, no billing):
- Basemaps: Esri World Imagery (satellite, default) and USGS topo, switchable in Layers.
- 3D: a raster-DEM terrain source (keyless public terrain tiles, e.g. AWS Terrarium) with
  hillshade, plus a tilt toggle that pitches the camera and keeps terrain across style changes
  (the pattern Sesh uses in `lib/map-terrain.ts` / `TiltToggle.tsx`, re-implemented for
  MapLibre).
- Overlays ported from Keeper: National Forest and BLM land tiles, and the fish filter.
- Must stay client-only (`next/dynamic`, `ssr: false`) under the static export.
- The service worker gets a runtime cache for imagery and DEM tiles, similar to `foray-basemap`.
  The offline download feature does **not** pre-fetch imagery in v1 (too large).

### Fishing data in Foray

- `scripts/import-keeper.mjs` (node, strip-types) reads Keeper's committed JSON from a path
  (default `../keeper/data`) and writes generated TS modules under `lib/fishing/`
  (banner: do not edit by hand): waters index (id, name, type, states, lon/lat, reach lines),
  per-water regulations, species/groups, stocking events and schedules, sources and citations.
  The generated output is committed, like Foray's other data-as-code.
- Status resolution (decided): **extract a pure, DB-free module inside Keeper**
  (`src/resolve/`: rule selection for a date, `deriveStatus`, season logic) and have Keeper's
  API use it, with Keeper's existing tests passing. `import-keeper` copies that module into
  `lib/fishing/engine/` (generated banner, same source), so there is one engine and no drift.
  In Foray it's plain TS that node scripts can import (no JSX, explicit `.ts` extensions, same
  rule as `lib/regions.ts`).
- The export records Keeper's commit SHA and export date in the generated module. Settings
  shows "Fishing data as of <date>". Refreshing is manual: run `import-keeper`, commit, push.
  Autodeploy does not reach into `../keeper`. *(My call.)*
- Rules are resolved on the device for **today's local date**. Every rule card shows the
  citation, source link, `asOf`/retrieval date, confidence, and the verify banner, as Keeper
  does.
- Guard tests (`node --test`, as Foray's other `scripts/*.test.mjs`): every water has a valid
  location; every regulation validates against its param schema; the import is idempotent
  (`git diff` clean on re-run); and the on-device status agrees with Keeper's live API.
- Golden fixtures: none exist today (Keeper's rules tests use small synthetic waters). A new
  Keeper-side script brings up Keeper's DB, ingests everything, and records
  `/api/waters/:id/rules?on=<date>` for about 40 waters × 4 dates (every season boundary
  type, C&R reaches, Pyramid, a `verifyCurrent` water, a NV water). Keeper's current output
  is ground truth. The fixtures are committed in Foray. *(My call.)*

### Fishing features in v1 *(my call)*

- **In:** water search (folded into the one search), the rules sheet (rule cards, citations,
  verify banner, license and reciprocity section, species at this water), a per-water stocking
  section, the statewide stocking feed in Guide → Fish, the fish filter, NF/BLM overlays, and
  tap-a-reach to spotlight it.
- **Later:** URL deep links for waters and sections, and chat result cards for fishing answers.
- The import emits everything the "in" list needs, including `seasonPeriods` and reciprocity.
- Bundle size: the waters index ships in the main bundle. Per-water rules are split
  (dynamic import per state or per water chunk) so the map home doesn't load 9 MB up front.
  They're still precached by the service worker so they're available offline.

### Regions

Foray's regions (`lib/regions.ts`) filter species. Waters are filtered by map viewport and
distance, not by region. Keeper only covers CA/NV, so in Pacific Northwest the fish half of the
trip card shows a plain "No fishing data for this area yet" state, not an empty list.

### AI

One **Ask** tab using Foray's existing chat path (password-gated proxy or BYO key). Keeper's
fishing tools are re-implemented as client-side tool handlers over the bundled data (water
lookup, rules for a date, stocking), so a single conversation can answer both "what's fruiting"
and "can I keep fish at Boca". Keeper's server-side Agent SDK chat is not ported. *(My call.)*

### Look

v1 scope (decided): **only the new surfaces**: the map home, trip card, rules sheet, Guide → Fish,
and the tab bar / top bar shell. The catalog, species pages, lookalike badges and journal keep
their current styling. A full restyle is a later project.

One visual system that blends the two: Keeper's bone paper and ledger ink, its rubber-stamp
statuses, and Fraunces / Inter / IBM Plex Mono type. Amber is the forage accent and river blue
the fish accent, as in the mockups. The new tokens are added to `app/globals.css` under new names, not
replacing the parchment/moss set.

## Left to the builder

- How the waters index and rules are chunked, and the exact cache names.
- Copy rules for the trip headline, as long as they come from real values.
- How forage "pins" are sourced on the map (existing spot-finder results and journal entries vs
  suggestions).
- The order of work and how to stage the Leaflet → MapLibre swap.
- Desktop layout details, which follow the existing side-nav pattern.

### Extras (phase 2, after the core ships) *(my calls, invited by the maintainer)*

- **Catches in the Journal:** a journal entry can be a find or a catch (species, water, length,
  kept/released, photo, location). When you're at a water, a catch entry offers that water's
  rules (bag, size) as a quick check.
- **Saved spots:** one pin list across forage and fish, shown on the map and offline.
  Stored in `localStorage` like the journal.
- **Daylight and legal hours:** the trip card shows sunrise and sunset and, for waters with a
  `fishing_hours` rule, the legal fishing window for today.
- **License reminder:** in Settings you enter your license state and expiry. The fish half warns
  when it's expired or expires within 14 days, and when the nearest water is in a state you
  don't hold a license for (using Keeper's reciprocity data).

## Calls I made (for review)

- Today and Charts tabs fold into the trip card's expanded view.
- MapLibre with keyless Esri imagery and public terrain tiles, not Mapbox.
- One Ask chat with client-side fishing tools; Keeper's Agent SDK chat not ported.
- No satellite pre-fetch in the offline download for v1.
- Golden fixtures recorded from Keeper's live API (Keeper is ground truth).
- The v1 fishing feature list above; deep links and chat cards come later.
- Manual data refresh, with the export SHA/date shown in Settings.
