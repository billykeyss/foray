# Prompt — Scale the forecasting score beyond mushrooms (add a plant-seasonality engine)

Paste this into a fresh Claude Code session in the `mushroom-rain-tracker` repo to
implement the forecasting side of green-edibles support. The **data layer**
(`PlantSpecies` schema + curated Tahoe–Truckee catalog) is built separately; this
prompt is only about the *"is it in season near me right now?"* scoring and its
surfacing on the Today page.

---

## Context you need

The app's current "core" is a **rainfall-driven fungal-fruiting model**, not a
general seasonality model:

- `lib/weather.ts` → `computeSporeScore(days)` turns recent daily weather into a
  single `SporeReading` (`score`, `daysSinceRain`, `rain7d`, `humidityToday`,
  `tempToday`, a mood `hook`, etc.).
- `scoreSpecies(species, reading)` scores a `MushroomSpecies` against that reading
  using rain7d, days-since-rain, temperature, humidity, **and** whether the current
  month is in `species.fruitingMonths`.
- `suggestSpecies` / `suggestSpeciesList` filter to in-season + in-region and rank.
- `app/page.tsx` (Today) renders this as a spore gauge + "Day N after rain."

**Why it doesn't generalize to plants:** wild greens are *seasonal* (month-driven,
lightly modulated by an early/late spring), not rain-flush organisms. `SporeReading`
has no meaning for a nettle. Do **not** route plants through the spore engine.

## Goal

Add a **second, simpler engine** that scores plants by season and surfaces a
"Greens in season near you" section on Today, sitting *beside* the spore gauge — not
inside it.

## Design constraints

- **Static export + offline-first.** No new servers, no network at score time. Reuse
  the daily weather already fetched via `useLocation()` — no new API.
- **Reuse, don't fork, the calendar logic.** Plants carry `harvestMonths` /
  `peakMonths` (exact parallels to mushroom `fruitingMonths` / `peakMonths`).
- **Type against `Forageable`** (`lib/forageable.ts`) for the shared bits
  (id, names, region) so region filtering (`speciesInRegions`) is reused as-is.

## What to build

1. **`scorePlant(plant, weather)` in `lib/weather.ts` (or `lib/plant-season.ts`).**
   - Base score from month-in-season: peak month > shoulder harvest month > out.
   - **Light temperature nudge only** (this is the whole "weather-aware" ask):
     if `plant.seasonCue.tempSensitive`, advance/retard the window using the recent
     mean temperature already in the fetched `DailyWeather[]` (e.g. an unusually warm
     early spring bumps a shoulder month up toward peak; a cold one damps it). Keep it
     a small ± modifier, not a rain model.
   - Return `{ score, inSeason, peak, note }`.

2. **`suggestPlants(weather, filterTerms)`** — parallels `suggestSpeciesList`:
   filter to in-region (`speciesInRegions` over the plant catalog) + in-season, rank
   by `scorePlant`, return the top N.

3. **Today integration (`app/page.tsx`).** A distinct "Greens in season near you"
   section below the mushroom reading. Plants get a simple in-season / peak chip —
   **no spore gauge, no "Day N after rain."** Empty state when nothing is in season.

## Acceptance criteria

- Feeding a warm early-spring `DailyWeather[]` surfaces early-season greens (nettle,
  miner's lettuce) as "in season"; feeding a mid-winter series surfaces none.
- Region filter respected: an Eastern-Sierra-only plant (e.g. pinyon) does not appear
  for a Pacific-Northwest region selection.
- Works with the service worker offline (no fetch at score time).
- No changes to `computeSporeScore` / `scoreSpecies` behavior for mushrooms.

## Explicitly out of scope

- The plant catalog data itself (built separately).
- Any UI beyond the Today "greens in season" section (catalog/detail pages, nav).
- Rainfall or humidity modeling for plants.
