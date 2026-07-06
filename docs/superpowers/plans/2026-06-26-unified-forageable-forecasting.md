# Unified Forageable Forecasting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a seasonality forecaster for wild plants (incl. fruit/berries) beside the existing mushroom engine, behind one shared `Forecaster` contract, and surface it on the Today page.

**Architecture:** A thin `lib/forecast/` framework standardizes region-filtering + a ranked-card output. The existing rain-flush mushroom engine is *wrapped* (unchanged). A new `lib/plant-season.ts` scores plants by calendar month plus a small, bounded temperature nudge. Shellfish is a future plug-in (own spec).

**Tech Stack:** Next 15 static export, TypeScript, `node --test --experimental-strip-types` (node:test), existing `lib/weather.ts` + `lib/plant-catalog.ts`.

**Reference spec:** `docs/superpowers/specs/2026-06-26-unified-forageable-forecasting-design.md`

---

## File structure

- **Create** `lib/forecast/types.ts` — `Kind`, `ForageEnv`, `RankedItem`, `Forecaster`.
- **Create** `lib/plant-season.ts` — `MONTHLY_NORMAL_C`, `scorePlant`, `suggestPlants`.
- **Create** `lib/forecast/plant.ts` — `plantForecaster` adapter.
- **Create** `lib/forecast/mushroom.ts` — `mushroomForecaster` adapter over `weather.ts`.
- **Create** `lib/forecast/registry.ts` — `REGISTRY`.
- **Create** `components/greens-in-season.tsx` — presentational Today section.
- **Create** `scripts/plant-season.test.mjs`, `scripts/check-forecast-registry.test.mjs`.
- **Modify** `app/page.tsx` — render the plant section below the mushroom reading.
- **Do NOT modify** any mushroom scoring in `lib/weather.ts` (only import from it).

---

### Task 1: Forecast framework types

**Files:**
- Create: `lib/forecast/types.ts`

- [ ] **Step 1: Write the types** (no test — pure type declarations)

```ts
import type { DailyWeather } from "../weather";
import type { Forageable } from "../forageable";

export type Kind = "mushroom" | "plant" | "shellfish";

/** Everything an engine might read. Each engine pulls only what it needs.
 *  `now` is injected (never read from a global clock inside engines) so scoring
 *  is deterministic and unit-testable. */
export interface ForageEnv {
  weather: DailyWeather[];
  now: Date;
  lat: number;
  lon: number;
}

/** Uniform card shape every engine emits, so the Today page renders them alike. */
export interface RankedItem {
  id: string;
  kind: Kind;
  item: Forageable;
  score: number; // 0–100, comparable within a kind
  label: string;
  note?: string;
  href: string;
}

export interface Forecaster {
  kind: Kind;
  title: string;
  emptyState: string;
  suggest(env: ForageEnv, regionTerms: string[] | null): RankedItem[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (no new errors).

- [ ] **Step 3: Commit**

```bash
git add lib/forecast/types.ts
git commit -m "feat(forecast): add Forecaster framework contract"
```

---

### Task 2: `scorePlant` — calendar base + bounded temp nudge (TDD)

**Files:**
- Create: `lib/plant-season.ts`
- Test: `scripts/plant-season.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePlant, MONTHLY_NORMAL_C } from "../lib/plant-season.ts";
import { PLANT_CATALOG } from "../lib/plant-catalog.ts";

const nettle = PLANT_CATALOG.find((p) => p.id === "stinging-nettle"); // harvest [4,5,6,7], peak [5,6]
const env = (year, monthIdx0, weather = []) => ({ weather, now: new Date(year, monthIdx0, 15), lat: 39.3, lon: -120.2 });
const warm = (n, t) => Array.from({ length: n }, () => ({ time: "x", tempMax: t + 4, tempMin: t - 4, tempMean: t, precipitation: 0, windSpeed: 3, humidity: 50, pressure: 1015 }));

test("out-of-season month scores 0 and inSeason false", () => {
  const r = scorePlant(nettle, env(2026, 0)); // January
  assert.equal(r.inSeason, false);
  assert.equal(r.score, 0);
});

test("peak month outscores a shoulder month (neutral weather)", () => {
  const may = scorePlant(nettle, env(2026, 4)); // May = peak
  const apr = scorePlant(nettle, env(2026, 3)); // April = shoulder
  assert.equal(may.peak, true);
  assert.equal(apr.peak, false);
  assert.ok(may.score > apr.score, `${may.score} !> ${apr.score}`);
});

test("temp nudge is bounded to [-12, +15] on a shoulder month", () => {
  const hot = scorePlant(nettle, env(2026, 3, warm(7, 25))); // way above April normal
  const cold = scorePlant(nettle, env(2026, 3, warm(7, -25)));
  assert.ok(hot.score <= 75 && hot.score >= 73, `hot=${hot.score}`); // base 60 + max 15
  assert.equal(cold.score, 48); // base 60 - max 12
});

test("temp-insensitive plant ignores weather", () => {
  const fake = { harvestMonths: [4], peakMonths: [], seasonCue: { tempSensitive: false, notes: null } };
  const r = scorePlant(fake, env(2026, 3, warm(7, 25)));
  assert.equal(r.score, 60); // shoulder base, no nudge
});

test("monthly normals table has 12 entries", () => {
  assert.equal(MONTHLY_NORMAL_C.length, 12);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test --experimental-strip-types scripts/plant-season.test.mjs`
Expected: FAIL (`scorePlant` not exported).

- [ ] **Step 3: Implement `scorePlant`**

```ts
import type { PlantSpecies } from "./plant-types";
import type { ForageEnv } from "./forecast/types";

/** Tahoe–Truckee montane (~1900 m) monthly mean air temp (°C). Coarse baseline
 *  for the early/late-spring nudge only — NOT a climate model. Index 0 = Jan. */
export const MONTHLY_NORMAL_C = [-3, -1, 1, 4, 8, 12, 16, 15, 12, 7, 1, -2];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface PlantSeasonReading {
  score: number;
  inSeason: boolean;
  peak: boolean;
  label: string;
  note?: string;
}

/** Score a plant's harvest-readiness for the current month. Calendar-driven
 *  (peak > shoulder > out) with a small ± temperature nudge for an early/late
 *  spring. No rain/humidity terms — plants are seasonal, not rain-flush. */
export function scorePlant(plant: PlantSpecies, env: ForageEnv): PlantSeasonReading {
  const month = env.now.getMonth() + 1;
  const inSeason = plant.harvestMonths.includes(month);
  const peak = plant.peakMonths.includes(month);
  if (!inSeason) return { score: 0, inSeason: false, peak: false, label: "Out of season" };

  const base = peak ? 85 : 60;
  let nudge = 0;
  let note: string | undefined;
  if (plant.seasonCue.tempSensitive && env.weather.length) {
    const recentMean = env.weather.reduce((s, d) => s + d.tempMean, 0) / env.weather.length;
    const anomaly = recentMean - MONTHLY_NORMAL_C[month - 1];
    nudge = clamp(Math.round(anomaly * 3), -12, 15); // asymmetric: warmth advances more than cold retards
    if (!peak && nudge >= 6) note = "Early — warm spell";
    else if (!peak && nudge <= -6) note = "Later — cool spell";
  }
  return { score: clamp(base + nudge, 0, 100), inSeason, peak, label: peak ? "Peak now" : "In season", note };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test --experimental-strip-types scripts/plant-season.test.mjs`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/plant-season.ts scripts/plant-season.test.mjs
git commit -m "feat(forecast): add scorePlant seasonality scorer"
```

---

### Task 3: `suggestPlants` — rank in-region, in-season edibles (TDD)

**Files:**
- Modify: `lib/plant-season.ts`
- Modify: `scripts/plant-season.test.mjs`

- [ ] **Step 1: Add failing tests**

```js
import { suggestPlants } from "../lib/plant-season.ts";
import { REGIONS } from "../lib/regions.ts";

const SIERRA = REGIONS.find((r) => r.id === "sierra-nevada").terms;
const PNW = REGIONS.find((r) => r.id === "pacific-northwest").terms;

test("warm early spring (April) surfaces early greens", () => {
  const items = suggestPlants(env(2026, 3, warm(7, 12)), SIERRA);
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes("stinging-nettle"), ids.join(","));
  assert.ok(ids.includes("miners-lettuce"), ids.join(","));
  assert.ok(!ids.includes("thimbleberry")); // berry, harvest [7,8,9] — not April
});

test("mid-winter (January) surfaces nothing", () => {
  assert.equal(suggestPlants(env(2026, 0, warm(7, -2)), SIERRA).length, 0);
});

test("region filter respected — no Sierra plant shows for a PNW selection", () => {
  const items = suggestPlants(env(2026, 8, warm(7, 12)), PNW); // Sept, peak for many
  assert.equal(items.length, 0);
});

test("never surfaces a deadly/toxic warning entry", () => {
  for (let m = 0; m < 12; m++) {
    for (const it of suggestPlants(env(2026, m, warm(7, 12)), SIERRA)) {
      assert.ok(!["deadly", "toxic", "inedible"].includes(it.item.edibility), `${it.id} @ month ${m + 1}`);
    }
  }
});

test("emits RankedItem shape with a plants deep link", () => {
  const [it] = suggestPlants(env(2026, 4, warm(7, 12)), SIERRA); // May
  assert.equal(it.kind, "plant");
  assert.ok(it.href.startsWith("/plants/"));
  assert.ok(it.score >= 0 && it.score <= 100);
  assert.ok(it.label.length > 0);
});
```

- [ ] **Step 2: Run — expect FAIL** (`suggestPlants` not exported)

Run: `node --test --experimental-strip-types scripts/plant-season.test.mjs`

- [ ] **Step 3: Implement `suggestPlants`** (append to `lib/plant-season.ts`)

```ts
import { EDIBLE_PLANTS } from "./plant-catalog";
import { speciesInRegions } from "./weather";
import type { RankedItem } from "./forecast/types";

/** In-region, in-season edible plants ranked by seasonal readiness. Iterates
 *  EDIBLE_PLANTS (never PLANT_CATALOG) so deadly/toxic warning entries — which
 *  carry empty harvestMonths — can never surface here. */
export function suggestPlants(env: ForageEnv, regionTerms: string[] | null, limit = 6): RankedItem[] {
  return EDIBLE_PLANTS
    .filter((p) => speciesInRegions(p, regionTerms))
    .map((p) => ({ p, r: scorePlant(p, env) }))
    .filter(({ r }) => r.inSeason)
    .sort((a, b) => b.r.score - a.r.score)
    .slice(0, limit)
    .map(({ p, r }): RankedItem => ({
      id: p.id, kind: "plant", item: p, score: r.score, label: r.label, note: r.note, href: `/plants/${p.id}`,
    }));
}
```

- [ ] **Step 4: Run — expect PASS** (10 total)

Run: `node --test --experimental-strip-types scripts/plant-season.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add lib/plant-season.ts scripts/plant-season.test.mjs
git commit -m "feat(forecast): add suggestPlants ranked in-season query"
```

---

### Task 4: Engine adapters + registry (TDD)

**Files:**
- Create: `lib/forecast/plant.ts`, `lib/forecast/mushroom.ts`, `lib/forecast/registry.ts`
- Test: `scripts/check-forecast-registry.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRY } from "../lib/forecast/registry.ts";
import { REGIONS } from "../lib/regions.ts";

const SIERRA = REGIONS.find((r) => r.id === "sierra-nevada").terms;
const warm = (n, t) => Array.from({ length: n }, () => ({ time: "x", tempMax: t + 4, tempMin: t - 4, tempMean: t, precipitation: 0, windSpeed: 3, humidity: 50, pressure: 1015 }));
const env = { weather: warm(7, 12), now: new Date(2026, 4, 15), lat: 39.3, lon: -120.2 };

test("registry has mushroom and plant forecasters", () => {
  const kinds = REGISTRY.map((f) => f.kind);
  assert.deepEqual(kinds, ["mushroom", "plant"]);
});

test("every forecaster carries a title and emptyState", () => {
  for (const f of REGISTRY) {
    assert.ok(f.title.length > 0, f.kind);
    assert.ok(f.emptyState.length > 0, f.kind);
    assert.equal(typeof f.suggest, "function");
  }
});

test("suggest() emits well-formed RankedItems", () => {
  for (const f of REGISTRY) {
    for (const it of f.suggest(env, SIERRA)) {
      assert.equal(it.kind, f.kind);
      assert.ok(it.score >= 0 && it.score <= 100);
      assert.ok(it.label.length > 0);
      assert.ok(it.href.startsWith("/"));
      assert.ok(it.item && typeof it.item.id === "string");
    }
  }
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test --experimental-strip-types scripts/check-forecast-registry.test.mjs`

- [ ] **Step 3: Implement the three modules**

`lib/forecast/plant.ts`:
```ts
import { suggestPlants } from "../plant-season";
import type { Forecaster } from "./types";

export const plantForecaster: Forecaster = {
  kind: "plant",
  title: "Greens & fruit in season",
  emptyState: "Nothing's in season here right now — wild greens return in spring.",
  suggest: (env, regionTerms) => suggestPlants(env, regionTerms),
};
```

`lib/forecast/mushroom.ts` (wraps the existing engine — no scoring change):
```ts
import { computeSporeScore, suggestSpeciesList } from "../weather";
import type { Forecaster, RankedItem } from "./types";

export const mushroomForecaster: Forecaster = {
  kind: "mushroom",
  title: "Mushrooms flushing",
  emptyState: "No likely mushroom flush near you today.",
  suggest: (env, regionTerms) => {
    if (!env.weather.length) return [];
    const reading = computeSporeScore(env.weather);
    return suggestSpeciesList(reading, regionTerms, 6).map((s): RankedItem => ({
      id: s.id,
      kind: "mushroom",
      item: s,
      score: reading.score,
      label: `Day ${reading.daysSinceRain} after rain`,
      href: `/catalog/${s.id}`,
    }));
  },
};
```

`lib/forecast/registry.ts`:
```ts
import type { Forecaster } from "./types";
import { mushroomForecaster } from "./mushroom";
import { plantForecaster } from "./plant";

/** Order = Today-page section order. Shellfish appends here in its own spec. */
export const REGISTRY: Forecaster[] = [mushroomForecaster, plantForecaster];
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test --experimental-strip-types scripts/check-forecast-registry.test.mjs`

- [ ] **Step 5: Commit**

```bash
git add lib/forecast/plant.ts lib/forecast/mushroom.ts lib/forecast/registry.ts scripts/check-forecast-registry.test.mjs
git commit -m "feat(forecast): add plant + mushroom adapters and registry"
```

---

### Task 5: Today-page "in season" plant section

**Files:**
- Create: `components/greens-in-season.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create the presentational component**

```tsx
"use client";
import Link from "next/link";
import type { RankedItem } from "@/lib/forecast/types";
import type { PlantSpecies } from "@/lib/plant-types";
import { PlantEmoji, edibilityChip } from "@/components/plant-shared";

/** The plant forecaster's Today section. Sits beside — never through — the
 *  spore gauge: plants get a peak/in-season chip, no gauge, no "Day N after rain." */
export default function GreensInSeason({
  items, title, emptyState,
}: { items: RankedItem[]; title: string; emptyState: string }) {
  return (
    <section className="mt-10 lg:mt-14">
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--moss-soft)", marginBottom: 12 }}>
        {title}
      </div>
      {items.length === 0 ? (
        <p className="font-body" style={{ fontSize: 14, color: "var(--ink-soft)" }}>{emptyState}</p>
      ) : (
        <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((it) => {
            const plant = it.item as PlantSpecies;
            const chip = edibilityChip(plant.edibility);
            return (
              <li key={it.id}>
                <Link href={it.href} className="flex items-center gap-3" style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, textDecoration: "none" }}>
                  <PlantEmoji plant={plant} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="font-body block" style={{ fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {plant.commonNames[0]}
                    </span>
                    <span className="font-mono block" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                      {it.note ?? it.label}
                    </span>
                  </span>
                  <span className="font-mono flex-none" style={{ fontSize: 10, fontWeight: 600, color: it.label === "Peak now" ? "var(--moss)" : "var(--ink-soft)" }}>
                    {it.label === "Peak now" ? "PEAK" : "IN SEASON"}
                  </span>
                  <span className="font-mono flex-none" style={{ fontSize: 10, color: chip.color }}>{chip.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `app/page.tsx`** — add imports near the top:

```tsx
import GreensInSeason from "@/components/greens-in-season";
import { plantForecaster } from "@/lib/forecast/plant";
```

Inside `TodayPage`, read `lat`/`lon` from the location hook and compute the items (place beside the existing `reading`/`suggested` memos):

```tsx
const { weather, loading, error, lat, lon } = useLocation();
const greens = useMemo(
  () => plantForecaster.suggest({ weather, now: new Date(), lat: lat ?? 0, lon: lon ?? 0 }, filterTerms),
  [weather, lat, lon, filterTerms]
);
```

Render the section immediately after the `{reading && ( … )}` mushroom block closes, before `<SpotFinder />`:

```tsx
<GreensInSeason items={greens} title={plantForecaster.title} emptyState={plantForecaster.emptyState} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Visual check** — `npm run dev`, open `http://localhost:1245`, confirm the "Greens & fruit in season" section renders under the mushroom reading (with the Sierra region selected and a summer-ish date it lists greens; otherwise shows the empty-state line). Screenshot for the record.

- [ ] **Step 5: Commit**

```bash
git add components/greens-in-season.tsx app/page.tsx
git commit -m "feat(forecast): surface in-season plants on Today"
```

---

### Task 6: Full verification

- [ ] **Step 1: Typecheck** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 2: All tests** — `npm test` → all green (includes the 2 new suites; count rises by ~13).
- [ ] **Step 3: Production build** — `rm -rf .next && npm run build` → "Compiled successfully" + "SW built".
- [ ] **Step 4: Mushroom-unchanged sanity** — confirm `git diff` on `lib/weather.ts` shows only the pre-existing `speciesInRegions` signature change (no edits to `computeSporeScore`/`scoreSpecies`/`suggestSpecies`).

---

## Self-review

**Spec coverage:** framework contract → Task 1; plant scorer (calendar + bounded nudge, monthly normals) → Task 2; `suggestPlants` over `EDIBLE_PLANTS` → Task 3; mushroom wrap + registry → Task 4; Today surface + frequent empty state → Task 5; testing (warm-spring/mid-winter/region/peak/nudge/no-warnings) → Tasks 2–4; verify + mushroom-unchanged guard → Task 6. Shellfish is out of scope (own spec) ✓.

**Placeholder scan:** none — every code + test block is complete and uses real catalog ids.

**Type consistency:** `ForageEnv`/`RankedItem`/`Forecaster` defined in Task 1 are used verbatim in Tasks 2–5; `scorePlant`/`suggestPlants` signatures match between definition and test; `edibilityChip`/`PlantEmoji` match `components/plant-shared.tsx`; `suggestSpeciesList(reading, regionTerms, 6)` matches the existing `(reading, filterTermsOrLimit, limit)` signature.
