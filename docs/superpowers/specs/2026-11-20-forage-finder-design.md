# Forage Finder — design

## Intent
The user forages around Reno/Tahoe and wants to ask "Where can I find morels today?" and get
a few concrete **pins on the map**, each with plain reasons. Reasons combine the past week's
weather (rain, humidity, soil moisture/temperature) with the ground itself: drainages, slope
aspect, elevation, tree cover, burn scars. It must feel like part of the existing app (map home +
trip card + Ask), not a bolt-on. The user opted out of questions; everything below marked
*(call)* is the designer's decision.

## Goals
- A **Find flow on the map**: pick a species → ranked spots appear as numbered pins with reasons.
- Ask can do the same: "where can I find morels today" → same results as a chat card with
  "Show on map".
- Honest answers: out of season or bad conditions → say so plainly and suggest what *is* in season.
- Works from the phone with no server (static export; all calls are client-side to public CORS APIs).

## Non-goals / anti-goals
- Not a guarantee or "secret spot" generator; never claim certainty. Every result carries
  "Check land status and fire closures; verify ID before eating." *(call)*
- No new backend, no API keys, no paid data.
- No private-land/ownership lookup this round (only a caution + the existing NF/BLM overlay).
- Never mark a deadly/toxic species as a find target: only species with edibility
  `choice`/`edible` are offered *(call)*.

## Approaches considered
1. **AI-only** — send the question to Claude and let it guess coordinates. Rejected: hallucinated
   pins, no real terrain data, needs a key.
2. **Fixed preset spots** (today's `find_spots`, 16 points, weather only). Rejected: can't find
   new ground, ignores habitat.
3. **On-device habitat scoring over a candidate grid** (chosen *(call)*). Deterministic, testable
   scoring from real data; the AI (Ask) only *calls* it and explains. Claude is optional.

## Data sources (all verified CORS-open, keyless)
- **Weather**: Open-Meteo forecast API, multi-location in one request
  (`latitude=a,b,c&longitude=…`), `past_days=7&forecast_days=3`, daily
  `precipitation_sum,relative_humidity_2m_mean,temperature_2m_max,temperature_2m_min`, hourly
  `soil_moisture_3_to_9cm,soil_temperature_6cm` (aggregate to 7-day means). Response also gives
  model elevation. Chunk to ≤50 points/request.
- **Terrain**: AWS terrarium tiles `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
  (already used by the map). Decode `elev = R*256 + G + B/256 − 32768` on an OffscreenCanvas /
  canvas at z12. Derive per point: elevation, slope, aspect (N/NE/…), and topographic position
  index (point vs. mean of ~300 m ring) → "drainage / valley bottom" when strongly negative,
  "ridge" when positive.
- **Tree cover**: LANDFIRE 2023 EVT WMS `GetFeatureInfo` (same host/layer as the Forest overlay,
  `info_format=application/json`) returns `GRAY_INDEX` (EVT code). Ship a generated lookup
  `lib/forage-find/evt-names.ts` (code → name, physiognomy) for codes in CA/NV built from
  LANDFIRE's published EVT attribute CSV; script in `scripts/` *(call)*. Only query EVT for the
  top ~15 pre-scored candidates (it's one request per point).
- **Burns**: existing `public/data/burns.geojson` (fire name + year). Point-in-polygon → burn
  age in years.

## Species habitat profiles
`lib/forage-find/profiles.ts`: a `HabitatProfile` per findable species, derived from the catalog
(`fruitingMonths`, `peakMonths`, `elevationM`, `hostTrees`, `habitat`, `substrate`) plus a small
hand-tuned override table for the headline species *(call)*: morels (burn age 1–2 y strongly
preferred, also riparian cottonwood; soil temp 7–14 °C; post-snowmelt), chanterelles, king
bolete, matsutake, hedgehog, lobster, oyster, shaggy mane, chicken-of-the-woods, puffballs.
Profile fields: months, elevation band, host keywords matched against EVT names (e.g. "Abies",
"fir", "Pinus ponderosa", "Populus"), moisture need, soil-temp window, terrain preference
(drainage/aspect), burn preference.

## Scoring (pure, unit-tested: `lib/forage-find/score.ts`)
- Candidates: grid within radius (default 40 km *(call)*; 15/40/80 km choice) around the current
  location, ~60 points, plus burn-polygon interior points for burn-loving species; each candidate
  snapped to the local drainage low point within ~400 m when the profile prefers drainages.
- Season gate first: outside fruiting months → no pins; return `outOfSeason` with the months and a
  list of findable species in season now (for the honest empty state).
- Weighted factors 0–1 → total 0–100: season (peak > fruiting), elevation fit, moisture (7-day
  rain + soil moisture + humidity), soil-temp fit, host-tree match, terrain fit, burn fit.
  Snow/freeze proxy: soil temp < 2 °C or recent max temp < 3 °C → heavy penalty with reason.
- Each result: `{ lat, lon, score, label, elevationM, reasons: Reason[], cautions: string[] }`,
  reasons ordered by contribution, short human strings ("Burned 2024 · Caldor", "Drainage bottom",
  "North-facing", "White fir – mixed conifer", "1.4 in rain past 7 d", "Soil 9 °C").
- Return top 5 with min spacing (~2 km) so pins aren't clustered. Label = direction + distance from
  the nearest named preset/town *(call)*, e.g. "6 km NE of Truckee".

## UI (Field Ledger look — `.kp` / `--kp-*` tokens, `app/keeper.css`)
Entry points, all opening the same **Find sheet** on the map home:
1. Trip card Forage half: a "Find spots ›" link under the in-season species.
2. Unified search: species results get a "Find spots for {species}" row.
3. Species page `/catalog/[id]` (findable species only): "Find spots near me" → `/?find=<id>`
   (DocLink, and `find` added to SW `ignoreURLParametersMatching` + its test list).
4. Ask: new tool `find_forage_spots({ species, radiusKm? })` returning the same results; chat
   renders a card with the top pins and a "Show on map" link (`/?find=<id>`).

Find sheet (phone: replaces the trip card summary like RulesSheet does; desktop: left panel):
- Header: species chip (tap to change; picker lists findable species, in-season first) and
  radius chip (15 / 40 / 80 km).
- Conditions strip: past-7-day rain, humidity, soil temp at the search center, and the season
  status ("Peak now" / "In season" / "Out of season — Apr–Jun").
- Progress while scoring (steps: weather · terrain · trees), cancellable.
- Ranked list: number badge matching the map pin, score bar, label + elevation, reason chips,
  cautions. Tap a row → map flies to it. Row actions: Save spot (existing saved spots, kind
  forage), Directions (`https://maps.apple.com/?daddr=lat,lon` / geo link), Log find (Journal).
- Map: numbered amber pins + faint search-radius circle; pins clear when the sheet closes.
- Empty/out-of-season state: plain sentence + "In season now:" chips that rerun the search.
- Errors: per-source degradation (e.g. tree data unavailable → score without it and say so).
- Last result cached in `localStorage` (`foray.find.v1`) so reopening offline shows it, labelled
  with its time.

## Constraints
- Follow repo CLAUDE.md files: explicit `.ts` imports for node-testable modules, node:test tests in
  `scripts/*.test.mjs`, components prop-driven (pages read the catalog), `localIsoDate`/
  `useLocalToday` for "today", run tools via `./node_modules/.bin`, Prettier only on changed files.
- SW: add runtime caching for Open-Meteo (exists), terrarium (exists), LANDFIRE featureinfo
  (NetworkFirst, short expiry).
- Verify in a browser at phone (390×844) and desktop (1440×900); screenshots to
  `~/Desktop/Claude Screenshots/foray/forage-finder/`.
- Commit locally only; never push.

## Left to the builder
Exact weights, grid spacing, EVT keyword lists, component file split, copy polish.
