# scripts/lookalikes/ — the lookalike research pipeline

Turns "every lookalike a species mentions" into fully-catalogued, deep-linkable species. Loaded in addition to root + `scripts/CLAUDE.md`.

## Run order is load-bearing

```
extract-worklist  →  fetch-sources  →  (subagents author .cache/lookalikes/synth/*.json)
  →  codegen-synthesized  →  match-lookalikes  →  reconcile-danger  →  inject-features
```

**Why the last four must run in this order, every time:** `codegen-synthesized.mjs` regenerates `lib/catalog/lookalikes/synthesized.ts` **raw from JSON**, which **wipes the `catalogId` and `keyFeatures` that were injected into lookalike objects**. So after *any* codegen run you must re-run:

1. `match-lookalikes.mjs` — re-bakes `catalogId` pointers (which catalog species each lookalike *is*).
2. `reconcile-danger.mjs` — fixes safety mismatches: a lookalike deep-linking to a toxic/deadly species must not show a "safe" danger badge. Only rewrites SAFE→DANGEROUS, never the reverse. Must run **after** match (needs the `catalogId`) and **before** inject.
3. `inject-features.mjs` — re-bakes `keyFeatures[]` chips from `.cache/lookalikes/key-features.json`.

Forget a step and the `check-lookalike-links` guard test will fail. Finish with `npm test`.

## Stage reference

| Script | Reads | Writes |
|---|---|---|
| `extract-worklist.mjs` | `PNW_CATALOG` | `.cache/lookalikes/worklist.json` — distinct un-catalogued, non-genus lookalikes; flags deadly/toxic for the review gate |
| `fetch-sources.mjs` | worklist | `.cache/lookalikes/sources/<id>.json` (Wikipedia / iNaturalist / GBIF) |
| `codegen-synthesized.mjs` | `.cache/lookalikes/synth/*.json` | `synthesized.ts` **and** `pending-review/generated-pending.ts` |
| `match-lookalikes.mjs` | `PNW_CATALOG` + resolver | injects `catalogId` into all catalog `.ts` |
| `reconcile-danger.mjs` | `PNW_CATALOG` | rewrites unsafe danger badges |
| `inject-features.mjs` | `key-features.json` | injects `keyFeatures` |
| `extract-feature-worklist.mjs` | catalog | list of lookalikes still missing `keyFeatures` |

Name matching (dedup, genus-only detection, synonyms) is centralized in `lib/lookalike-resolver.ts` — use it, don't re-implement matching here.

## Review gate (safety-critical)

`codegen-synthesized.mjs` routes a species to `PENDING_SPECIES` (in `pending-review/generated-pending.ts`, imported nowhere) instead of the live catalog when its `edibility ∈ {toxic, deadly, psychoactive}` **or** its id is in `.cache/lookalikes/review-gate-ids.json`, **and** its id is **not** in `lib/catalog/pending-review/approved.json`. Adding an id to `approved.json` is the human sign-off that publishes a dangerous species. Never bypass this by hand-editing `generated.ts`.
