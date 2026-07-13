# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Foray** is a Next.js 15 **static-export** PWA field guide for Pacific Northwest mushrooms (deployed at foray.billhuang.me). It ships an offline-capable field book: a species catalog with photo galleries and lookalike cross-links, a spore/fruiting forecast from weather data, an AI "where should I forage" spot-finder, a foraging map, charts, and a journal. There is **no backend and no database** — every piece of data is compiled into TypeScript modules and bundled at build time.

## Commands

```bash
npm run dev          # dev server on http://localhost:1245 (Turbopack)
npm run build        # next build --no-lint  →  static site in out/, THEN builds the service worker
npm run lint         # next lint (build skips ESLint via --no-lint, but still type-checks)
npx tsc --noEmit     # fast standalone typecheck (next build also type-checks; ESLint is the only thing --no-lint drops)

npm test                                                   # all node:test suites (scripts/**/*.test.mjs)
node --test --experimental-strip-types scripts/check-offline-regions.test.mjs   # a single test file
```

Tests are plain `node --test` files (`scripts/*.test.mjs`) — there is no Jest/Vitest. `npm test` discovers every `*.test.mjs`. Node runs TypeScript sources directly via `--experimental-strip-types`, which is why data-pipeline scripts import `../lib/*.ts` with explicit extensions.

### Data & asset pipeline scripts

All are `node --experimental-strip-types scripts/...`. Their inputs live in `.cache/` and `.image-staging/`, **both gitignored** — the committed `.ts` outputs are the source of truth in git, not the pipeline inputs.

```bash
npm run localize:images    # rewrite remote image URLs → self-hosted GCS URLs (lib/local-images.ts)
npm run sync:images        # rsync .image-staging → gs://foray-field-guide/img  (uses a personal gcloud account, see Deploy)
npm run check:images       # report catalog images that 404
node scripts/build-sw.mjs               # regenerate the service worker (also runs at the end of npm run build)
node scripts/build-offline-regions.mjs  # regenerate lib/offline-regions.ts (per-region offline photo lists)
```

## Architecture: the big picture

### Static export, data-as-code

`next.config.ts` sets `output: 'export'` and `images.unoptimized`. `npm run build` emits a fully static `out/`. Consequences that shape everything:

- **No runtime data fetching for core content.** The catalog, trees, galleries, and image maps are large committed TS modules (`lib/catalog/curated.ts` alone is ~12k lines). Pages read them at build time; `app/catalog/[id]/page.tsx` uses `generateStaticParams()` over `PNW_CATALOG` to pre-render one HTML page per species.
- **The only runtime network calls** are to third-party APIs from the client: Open-Meteo (weather), the Anthropic API (spot-finder, with a user-supplied key), Carto basemap tiles, and the GCS photo bucket. The service worker caches all of these.
- There are **two** `next.config.*` files; `next.config.ts` is authoritative (it declares the `upload.wikimedia.org` remote pattern and is what `render.yaml` filters on). Treat `next.config.js` as stale.

### The species catalog and its split

`lib/species-types.ts` defines `MushroomSpecies` — the single, large domain type (identification, conditions, edibility, `lookalikes[]`, sources, plus optional enrichment blocks like `spores`, `bioactive`, `verification`). Read this first before touching any catalog data.

`lib/species-catalog.ts` is a thin aggregator exporting `PNW_CATALOG = [...CURATED_CATALOG, ...GENERATED_CATALOG]`. **Consumers import `PNW_CATALOG` and never care about the split.** The two halves:

- `lib/catalog/curated.ts` — hand-authored species.
- `lib/catalog/generated.ts` — pipeline-produced species (`autoCompiled: true`, real `sources[]`, honest `verification` blocks). It re-exports `SYNTHESIZED_SPECIES` from `lib/catalog/lookalikes/synthesized.ts` (~30k lines, codegen'd) plus a few hand-authored pilot entries.

### The lookalike research pipeline (the part that needs the most care)

The catalog was expanded so that every lookalike a species mentions can deep-link to its own `/catalog/[id]` page with a photo and key-feature chips. A `Lookalike` carries an optional `catalogId` (the species it *is*) and `keyFeatures[]` (diagnostic chips) — both **injected by scripts, not authored by hand**.

The flow: `extract-worklist` finds every un-catalogued, non-genus-only lookalike → `fetch-sources` pulls Wikipedia/iNaturalist/GBIF bundles → subagents author JSON into `.cache/lookalikes/synth/*.json` → the codegen chain turns that into typed catalog data.

**Pipeline order is load-bearing and easy to get wrong:**

```
codegen-synthesized  →  match-lookalikes  →  reconcile-danger  →  inject-features
```

- `codegen-synthesized.mjs` regenerates `synthesized.ts` **raw**, which **wipes `catalogId` and `keyFeatures`**. So `match-lookalikes` (bakes in `catalogId`) and `inject-features` (bakes in `keyFeatures`) **must be re-run after any codegen**. The guard tests below exist to catch a forgotten re-run.
- `match-lookalikes.mjs` and `inject-features.mjs` are regex codemods over the literal `.ts` files; they rely on a lookalike's `scientific:` being immediately followed by `danger:`. They are idempotent — verify with `git diff`.
- `reconcile-danger.mjs` fixes safety mismatches: a lookalike card must never show a "safe" badge when its `catalogId` target is actually toxic/deadly. It only rewrites SAFE→DANGEROUS, never the reverse.
- `lib/lookalike-resolver.ts` (`normalizeScientific`, `isGenusOnly`, `buildResolver`, plus a `SYNONYMS` map) is the shared name-matching brain for the pipeline. Genus-only lookalikes (e.g. "Russula spp.") intentionally get no `catalogId` and render text-only.

### The human review gate (safety-critical)

Deadly/toxic/psychoactive species are **not auto-published**. In `codegen-synthesized.mjs`, a species routes to `lib/catalog/pending-review/generated-pending.ts` (`PENDING_SPECIES`, imported **nowhere**) when `edibility ∈ {toxic, deadly, psychoactive}` OR it's in `review-gate-ids.json`, **AND** it is not listed in `lib/catalog/pending-review/approved.json`. `approved.json` is the committed human sign-off record: adding an id there is what promotes a dangerous species into the live catalog. `PENDING_SPECIES` is currently empty (all reviewed species have been promoted).

### Images: self-hosted, three layers

Photos are **not in git**. They live in a public GCS bucket (`storage.googleapis.com/foray-field-guide/img/`). `.image-staging/` is a gitignored local staging area that `npm run sync:images` rsyncs to the bucket.

- `lib/species-images.ts` — one lead thumb/full per species.
- `lib/species-gallery.ts` — multi-photo ID galleries (Commons + iNaturalist, license-filtered).
- `lib/local-images.ts` — the `LOCAL_IMAGES` map (remote URL → GCS URL) and `OFFLINE_IMAGE_URLS` (the full flat list the offline downloader pulls). Generated by `scripts/localize-images.mjs`.

### Offline / PWA (service worker)

`sw/index.ts` is the serwist service worker, **built separately** by `scripts/build-sw.mjs` (esbuild) into `out/sw.js` at the end of `npm run build` — it is **not** a Next route and is excluded from `tsconfig`. build-sw precaches the app shell (all HTML, `_next` JS/CSS, self-hosted fonts, icons, manifest). Runtime caches (CacheFirst/NetworkFirst) are keyed by host: `foray-photos` (GCS), `foray-wikimedia`, `foray-weather` (Open-Meteo), `foray-tiles` (Carto); `api.anthropic.com` is `NetworkOnly`.

**Gotcha:** the `foray-photos` `ExpirationPlugin.maxEntries` **must exceed the full offline photo set** (~4.6k renditions) or a full/region download silently self-evicts. It is currently 9000.

The opt-in "download for offline" feature: `lib/use-offline-download.ts` (hook) + `components/offline-download.tsx` (UI in Settings) offer an "Everything" download plus per-region downloads. Saved/ready status is computed from **actual Cache Storage contents** (not a localStorage flag) so it survives reloads. Region → photo-URL lists come from the generated `lib/offline-regions.ts`.

### Regions

`lib/regions.ts` is a **plain (no-JSX) module** holding `REGIONS`/`RegionId`/`RegionDef` (sierra-nevada, pacific-northwest, california-coast, great-basin, all). It was extracted out of `region-context.tsx` specifically so `node --experimental-strip-types` scripts can import it — **node cannot import `.tsx`.** `region-context.tsx` re-exports these for back-compat and provides the React `RegionProvider`. A region filters species by matching `term` substrings against each species' `regionsPNW[]`.

### Client state, AI, weather

- Global React state is context providers wired in `app/layout.tsx`: `Units`, `Region`, `ApiKey`, `Location`, `Clipboard`. Persistence is `localStorage` under `foray.*` keys.
- **AI spot-finder** (`lib/spot-finder.ts`): scores candidate spots from weather, then calls `https://api.anthropic.com/v1/messages` **directly from the browser** using a user-supplied key stored in `localStorage` (`foray.anthropic-key.v1`) with `anthropic-dangerous-direct-browser-access`. There is no server proxy — the key never leaves the user's browser. (Model string currently `claude-sonnet-4-6`.)
- **Weather** (`lib/weather.ts`): Open-Meteo forecast → a spore/fruiting readiness score used across the home page, charts, and spot-finder.

## Conventions & invariants worth internalizing

- **After changing the catalog, regenerate downstream artifacts.** Editing species can invalidate `lib/local-images.ts`, `lib/offline-regions.ts`, and the baked-in `catalogId`/`keyFeatures`. Re-run the relevant scripts, then `npm test` — the guard tests are the safety net:
  - `check-lookalike-links` — every non-genus lookalike resolves / links correctly.
  - `check-pending-review` — nothing dangerous leaked into the live catalog.
  - `check-offline-regions` — one non-empty group per real region, all subsets of `OFFLINE_IMAGE_URLS`.
  - `check-local-images`, `check-species-gallery`, `gallery`, `lookalike-resolver` — image/gallery/name-resolution integrity.
- **`allowImportingTsExtensions` is on**, and runtime imports use explicit `.ts` extensions (e.g. `./catalog/curated.ts`). This is required so both `next` and `node --experimental-strip-types` resolve the same modules. Keep the extensions.
- **Generated files carry a "do not edit by hand" banner** (`synthesized.ts`, `generated-pending.ts`, `offline-regions.ts`, `local-images.ts`, `species-gallery.ts`). Edit the generator, not the output.
- The pipeline is designed to be **idempotent and re-runnable** — prefer fixing a script and re-running over hand-editing generated `.ts`.

## Deploy

- Hosted as a **Render Static Site** (`render.yaml`), publish dir `out/`, `autoDeploy: true` — **pushing to `main` triggers a production deploy.** Render builds with pnpm (`corepack` + `pnpm-lock.yaml`), not npm. PR previews are enabled.
- `npm run sync:images` pushes to GCS using a **personal gcloud account** (`--account=yichenhuangwork@gmail.com`) and is a separate step from the site deploy.
- The maintainer prefers to **push and deploy themselves** — commit locally, run tests, and let them push, unless explicitly asked to push.
