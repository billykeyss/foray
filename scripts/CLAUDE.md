# scripts/ — data & asset pipeline

Node scripts that generate the committed `.ts` data modules and the service worker. Loaded in addition to the root `CLAUDE.md`.

## Runtime rules

- **Everything runs under `node --experimental-strip-types`** (`.mjs` files that import `.ts` sources). Import lib modules **with the extension**: `import { PNW_CATALOG } from "../lib/species-catalog.ts"`.
- **Node cannot import `.tsx`.** If a script needs something from a `.tsx` module, extract it to a plain `.ts` file first — this is exactly why `lib/regions.ts` exists (pulled out of `region-context.tsx`).
- **Inputs live in `.cache/` and `.image-staging/`, both gitignored.** The committed `.ts` outputs are the source of truth in git, not the pipeline inputs. A fresh clone can rebuild the outputs only after regenerating those caches.
- Many fetch scripts take an **`ONLY=id1,id2` env var** to process a subset (e.g. `ONLY=amanita-virosa node --experimental-strip-types scripts/lookalikes/fetch-sources.mjs`).

## Codemods

`match-lookalikes.mjs`, `inject-features.mjs`, and `reconcile-danger.mjs` are **regex codemods that rewrite the literal `.ts` catalog files in place.** They are idempotent (re-running is a no-op on already-correct entries) and rely on structural anchors — e.g. a lookalike's `scientific:` being immediately followed by `danger:`. **Always eyeball `git diff` after running one.**

## Generators write a banner

Generator outputs start with `// AUTO-GENERATED ... Do not edit by hand.` Fix the generator and re-run; never hand-edit the output. Shared helpers live in `scripts/lib/` (`gallery.mjs`, `wikimedia-url.mjs`).

## Tests

`scripts/*.test.mjs` are `node --test` files (no Jest/Vitest). Run all with `npm test`, or one file with `node --test --experimental-strip-types scripts/<name>.test.mjs`. The `check-*.test.mjs` files are guard tests over the generated data — run them after any pipeline run.

See `scripts/lookalikes/CLAUDE.md` for the lookalike research pipeline and its load-bearing run order.
