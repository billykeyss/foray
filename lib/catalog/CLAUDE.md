# lib/catalog/ — the species data

The catalog data behind `PNW_CATALOG`. Loaded in addition to the root `CLAUDE.md`.

## What's hand-authored vs generated

- **`curated.ts`** — hand-authored species. Edit freely (it's large — ~12k lines).
- **`generated.ts`** — a small hand-authored pilot list plus a re-export of `SYNTHESIZED_SPECIES`. This is the seam that surfaces pipeline species into `PNW_CATALOG`.
- **`lookalikes/synthesized.ts`** — **GENERATED** (codegen from `.cache/lookalikes/synth/*.json`). ~30k lines. Do **not** hand-edit; change the JSON + rerun `scripts/lookalikes/codegen-synthesized.mjs`.
- **`pending-review/generated-pending.ts`** — **GENERATED**, and imported **nowhere**. See below.

Both generated files carry a "Do not edit by hand" banner.

## Lookalike `catalogId` / `keyFeatures` are script-injected

Inside any species' `lookalikes[]`, the `catalogId` and `keyFeatures` fields are baked in by `scripts/match-lookalikes.mjs` and `scripts/lookalikes/inject-features.mjs`. **Don't hand-edit them** — a codegen run wipes them, and they're re-derived by re-running those scripts (see `scripts/lookalikes/CLAUDE.md` for the required order). Hand-authored curated species can have their `distinguishingFeature` prose edited by hand; the chips regenerate from it.

## The review gate

`pending-review/` holds dangerous species awaiting human sign-off:

- `generated-pending.ts` (`PENDING_SPECIES`) is **not imported by anything** — a species sitting here is not live.
- `approved.json` is the **committed sign-off record**: a flat list of ids that have passed safety review. Adding an id here is what lets codegen publish that (toxic/deadly/psychoactive) species into `generated.ts` instead of holding it in pending. It's currently populated; `PENDING_SPECIES` is currently empty.

Never move a dangerous species into the live catalog by editing `generated.ts` directly — approve it in `approved.json` and let codegen route it.

## Imports use explicit `.ts` extensions

e.g. `import { CURATED_CATALOG } from "./curated.ts"` — required so both `next` and `node --experimental-strip-types` resolve the same modules (`allowImportingTsExtensions` is on).
