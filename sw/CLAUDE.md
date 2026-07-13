# sw/ — the service worker

`index.ts` is the serwist service worker for the offline PWA. Loaded in addition to the root `CLAUDE.md`.

## It is not a Next route

- Built **separately** by `scripts/build-sw.mjs` (esbuild) into `out/sw.js`. This runs automatically at the **end of `npm run build`** — `next build` alone does not produce it.
- **Excluded from `tsconfig`** (`"exclude": ["...", "sw"]`), so `npx tsc --noEmit` will not typecheck it. Read carefully; the type safety net is thinner here.
- The precache manifest is injected at build time via esbuild `define` as `__SERWIST_MANIFEST` (declared `declare const`). `build-sw.mjs` decides what goes in it (app shell: HTML, `_next` JS/CSS, self-hosted fonts, icons, manifest — photos are runtime-cached, not precached).

## Runtime caches are keyed by host

Each third-party origin gets its own cache + strategy: `foray-photos` (GCS, CacheFirst), `foray-wikimedia`, `foray-tiles` (Carto), `foray-weather` (Open-Meteo, NetworkFirst). `api.anthropic.com` is intentionally **`NetworkOnly`** (never cache AI calls).

## The photo-cap gotcha

`foray-photos`'s `ExpirationPlugin.maxEntries` **must exceed the entire offline photo set** (~4.6k renditions across ~394 species) or a full/region "download for offline" **silently evicts itself** as it runs — and the UI would look done while photos vanish. It is currently **9000**. If the catalog grows substantially, raise this. The number lives here; the download logic and per-region URL lists live in `lib/use-offline-download.ts` + `lib/offline-regions.ts`.

## Testing a change

Edit `sw/index.ts` → `npm run build` → inspect `out/sw.js` (it's minified; grep for `foray-photos`, `maxEntries`, etc.). Service worker behavior can't be exercised by the dev server the same way — verify against the built output, ideally served and loaded in a browser with DevTools → Application → Cache Storage.
