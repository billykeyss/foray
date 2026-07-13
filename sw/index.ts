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
      matcher: ({ url }) => url.hostname.endsWith("basemaps.cartocdn.com"),
      handler: new CacheFirst({
        cacheName: "foray-tiles",
        plugins: [
          new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      // LANDFIRE forest/vegetation-type WMS tiles — cache what the user has
      // panned over so the forest overlay works partially offline.
      matcher: ({ url }) => url.hostname === "edcintl.cr.usgs.gov",
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
