import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  ExpirationPlugin,
  type PrecacheEntry,
} from "serwist";

declare const self: ServiceWorkerGlobalScope;
// Injected at build time by scripts/build-sw.mjs (esbuild `define`).
declare const __SERWIST_MANIFEST: (PrecacheEntry | string)[];

const serwist = new Serwist({
  precacheEntries: __SERWIST_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  precacheOptions: { cleanupOutdatedCaches: true },
  runtimeCaching: [
    {
      // Self-hosted field-guide photos in the public GCS bucket.
      matcher: ({ url }) =>
        url.hostname === "storage.googleapis.com" &&
        url.pathname.startsWith("/foray-field-guide/img/"),
      handler: new CacheFirst({
        cacheName: "foray-photos",
        plugins: [
          // Cap must exceed the full offline photo set (currently ~4.6k renditions
          // across 394 species) or a full/region download silently evicts itself.
          new ExpirationPlugin({ maxEntries: 9000, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      matcher: ({ url }) => url.hostname === "upload.wikimedia.org",
      handler: new CacheFirst({
        cacheName: "foray-wikimedia",
        plugins: [
          new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      matcher: ({ url }) => url.hostname === "api.open-meteo.com",
      handler: new NetworkFirst({
        cacheName: "foray-weather",
        networkTimeoutSeconds: 6,
        plugins: [
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 * 12, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      // Esri World Imagery satellite tiles. Must precede the basemap matcher,
      // which also matches server.arcgisonline.com.
      matcher: ({ url }) =>
        url.hostname === "server.arcgisonline.com" && url.pathname.includes("/World_Imagery/"),
      handler: new CacheFirst({
        cacheName: "foray-imagery",
        plugins: [
          new ExpirationPlugin({ maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      // AWS terrarium terrain (DEM) tiles for MapLibre terrain/hillshade.
      matcher: ({ url }) =>
        url.hostname === "s3.amazonaws.com" && url.pathname.startsWith("/elevation-tiles-prod/"),
      handler: new CacheFirst({
        cacheName: "foray-terrain",
        plugins: [
          new ExpirationPlugin({ maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      // Other basemaps + the water overlay (Esri canvas, USGS topo/hydro).
      matcher: ({ url }) =>
        url.hostname === "server.arcgisonline.com" || url.hostname === "basemap.nationalmap.gov",
      handler: new CacheFirst({
        // Renamed from "foray-tiles" when Carto was dropped, so no one keeps
        // serving Carto's cached "API KEY REQUIRED" placeholders.
        cacheName: "foray-basemap",
        plugins: [
          // Three styles + the overlay share this cap.
          new ExpirationPlugin({ maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      // LANDFIRE forest/vegetation-type WMS tiles plus the USFS national-forest
      // and BLM land-ownership overlays — cache what the user has panned over.
      matcher: ({ url }) =>
        url.hostname === "edcintl.cr.usgs.gov" ||
        url.hostname === "apps.fs.usda.gov" ||
        url.hostname === "gis.blm.gov",
      handler: new CacheFirst({
        cacheName: "foray-forest",
        plugins: [
          new ExpirationPlugin({ maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      matcher: ({ url }) => url.hostname === "api.anthropic.com",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// Retired tile caches: "foray-tiles" holds Carto tiles (latterly its "API KEY
// REQUIRED" placeholders), "foray-tiles-esri" the one-day Esri-only cache.
// Nothing requests either anymore; free the space.
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all(["foray-tiles", "foray-tiles-esri"].map((c) => caches.delete(c))));
});
