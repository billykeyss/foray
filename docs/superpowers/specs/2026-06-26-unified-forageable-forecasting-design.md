# Unified forageable forecasting — design

**Status:** approved (2026-06-26)
**Supersedes the scope of:** `docs/superpowers/prompts/forecasting-score-scaling.md` (which assumed the plant data layer didn't exist yet)

## Problem

The app's forecasting core is a **rainfall-driven fungal-fruiting model** (`computeSporeScore → SporeReading → scoreSpecies → suggestSpecies`). It answers "is now a good day for mushrooms near me?" It cannot represent other edible types:

- **Plants / greens / fruit / berries** are *seasonal* (calendar-driven, lightly modulated by an early/late spring), not rain-flush.
- **Shellfish** are *tide- and lunar-driven*, a third behavior again.

We want the Today page to forecast **all edible types**, without bending mushrooms through a plant model or vice versa.

## Approach — one thin framework, one engine per behavior (Option B)

A shared `Forecaster` contract with a **separate engine per fruiting behavior**. The abstraction earns its keep precisely because there are three genuinely different environments (rain history / calendar+temp / tide+moon). The framework standardizes only two things: **region filtering** and the **ranked-card output**. Each engine pulls whatever it needs from a shared environment object.

```
lib/forecast/
  types.ts        ForageEnv, RankedItem, Kind, Forecaster
  registry.ts     REGISTRY = [mushroomForecaster, plantForecaster]  (shellfish added later)
  mushroom.ts     adapter over the existing weather.ts engine (no behavior change)
  plant.ts        adapter over lib/plant-season.ts
lib/plant-season.ts   scorePlant(plant, env), suggestPlants(env, region)
```

### The contract

```ts
export type Kind = "mushroom" | "plant" | "shellfish";

export interface ForageEnv {
  weather: DailyWeather[]; // already fetched via useLocation()
  now: Date;               // injected, never read from a global clock inside engines
  lat: number;
  lon: number;
}

export interface RankedItem {
  id: string;
  kind: Kind;
  item: Forageable;   // name/region/etc. via the shared structural type
  score: number;      // 0–100, comparable within a kind
  label: string;      // "Peak now" | "Day 6 after rain" | "Spring-tide window"
  note?: string;
  href: string;       // deep link, e.g. /plants/[id]
}

export interface Forecaster {
  kind: Kind;
  title: string;                 // Today section heading
  emptyState: string;            // shown when suggest() returns []
  suggest(env: ForageEnv, regionTerms: string[] | null): RankedItem[];
}
```

`now` is passed **into** the engines (not read from `new Date()` inside them) so scoring is deterministic and unit-testable.

## Engine 1 — Mushrooms (wrap, do not modify)

`lib/forecast/mushroom.ts` is a thin adapter: it calls the existing `computeSporeScore(env.weather)` and `suggestSpeciesList(reading, regionTerms, N)`, mapping results to `RankedItem`. **No change to `computeSporeScore` / `scoreSpecies` / `suggestSpecies` behavior.** The Today page keeps its flagship `SporeGauge` + rich `SpeciesCard` for mushrooms; the adapter exists so the registry has a uniform shape and future kinds slot in beside it.

## Engine 2 — Plants incl. fruit/berries (build now — data is ready)

`lib/plant-season.ts`:

```ts
export interface PlantSeasonReading { score: number; inSeason: boolean; peak: boolean; label: string; note?: string; }
export function scorePlant(plant: PlantSpecies, env: ForageEnv): PlantSeasonReading
export function suggestPlants(env: ForageEnv, regionTerms: string[] | null, limit = 6): RankedItem[]
```

**Scoring model:**
- `month = env.now.getMonth() + 1`.
- `inSeason = plant.harvestMonths.includes(month)`; `peak = plant.peakMonths.includes(month)`.
- If not in season → not surfaced.
- **Calendar base:** `peak ? 85 : 60`.
- **Light temperature nudge** — only if `plant.seasonCue.tempSensitive` and weather is present:
  - `recentMean = mean(env.weather.map(d => d.tempMean))`.
  - `anomaly = recentMean − MONTHLY_NORMAL_C[month]` where `MONTHLY_NORMAL_C` is a small documented Tahoe–Truckee montane monthly-mean table (a constant in this file).
  - `nudge = clamp(round(anomaly * 3), −12, +15)` — asymmetric: a warm spring advances a shoulder month toward peak more than a cold one retards it. No rain/humidity terms.
  - `score = clamp(base + nudge, 0, 100)`.
- **`label`:** `peak` → "Peak now"; else in-season → "In season"; with a warm/cold shoulder, `note` reads "Early — warm spring" / "Later — cool spring".

**`suggestPlants` iterates `EDIBLE_PLANTS`, never `PLANT_CATALOG`.** (Audit finding: the 5 deadly/toxic warning entries carry empty `harvestMonths`; scoping to `EDIBLE_PLANTS` guarantees a death-camas card can never appear under "in season.") Filter to in-region (`speciesInRegions`) + in-season, rank by `scorePlant`, `href = /plants/${id}`, return top `limit`.

## Engine 3 — Shellfish (deferred to its own spec)

Registered later. Needs: a `ShellfishSpecies` data layer paralleling `PlantSpecies`; `scoreShellfish(env)` = open-season + spring-vs-neap tide from **moon phase** + daytime-low (offline lunar/season heuristic, matching the app's "good window?" altitude — **not** station-exact tide tables in v1); and **biotoxin-closure safety** — every shellfish card foregrounds "⚠ Check the current WA/OR/CA health-dept closure" and never implies "safe," mirroring the deadly-mushroom gate. The framework here is built so this is a clean plug-in, not a retrofit.

## Today page (`app/page.tsx`)

Below the mushroom reading, render each non-mushroom forecaster's section — **beside**, never **through**, the spore gauge:

- Section heading from `forecaster.title` ("In season near you").
- Each `RankedItem` → a compact card: `PlantEmoji` + common name + a **peak/in-season chip** + edibility chip, linking to `item.href`. **No spore gauge, no "Day N after rain"** for plants.
- **Empty state is a first-class, frequent state.** Harvest runs May–Oct (peak Jun–Sep); Dec–Mar is genuinely empty (audit). Show `forecaster.emptyState` — e.g. "Nothing's in season here right now — greens return in spring." Do not silently render nothing.
- Reuse `components/plant-shared.tsx` (`edibilityChip`, `PlantEmoji`, `MONTH_ABBR`).

## Testing

`scripts/plant-season.test.mjs` (node:test), injecting a synthetic `ForageEnv` (deterministic `now` + `weather`):
- Warm early-spring `weather` + `now` in April surfaces early greens (nettle, miner's lettuce) as in-season.
- Mid-winter `now` (January) surfaces **none**.
- Region filter respected — an Eastern-Sierra-only plant does not appear for a Pacific-Northwest region term set.
- `peak` months score above shoulder months.
- Temp nudge stays within `[−12, +15]` and only applies to `tempSensitive` plants.
- `suggestPlants` never returns a warning-edibility entry.

`scripts/check-forecast-registry.test.mjs`: every `RankedItem` has a resolvable `href`, `score ∈ [0,100]`, and a non-empty `label`; each registered forecaster has a `title` + `emptyState`.

**Guard:** a test asserting mushroom `suggestSpecies`/`scoreSpecies` output is unchanged for a fixed reading (regression lock on the wrap).

## Out of scope

- Shellfish subsystem (its own spec).
- Plant lookalike `catalogId` deep-linking (separate follow-up; not needed by the forecaster).
- Any rain/humidity modeling for plants; any station-exact tide tables.
- Bundled tide predictions and live tide APIs.

## Files

- **New:** `lib/forecast/{types,registry,mushroom,plant}.ts`, `lib/plant-season.ts`, `scripts/plant-season.test.mjs`, `scripts/check-forecast-registry.test.mjs`.
- **Changed:** `app/page.tsx` (add the plant section). `lib/weather.ts` only if a helper needs exporting — no scoring changes.
- **Untouched:** all mushroom scoring logic; the plant data layer.
