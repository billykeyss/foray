import { FISH_WATERS } from "./waters-index.ts";
import type { WaterDataset } from "./types.ts";

/** The water's rules are not in the offline cache and the network is unavailable. */
export class WaterNotCachedError extends Error {
  constructor(slug: string) {
    super(`Rules for "${slug}" are not downloaded`);
    this.name = "WaterNotCachedError";
  }
}

/** The slug is not one of the known fishing waters. */
export class WaterNotFoundError extends Error {
  constructor(slug: string) {
    super(`Unknown water "${slug}"`);
    this.name = "WaterNotFoundError";
  }
}

const KNOWN = new Set(FISH_WATERS.map((w) => w.slug));

/** Fetch one water's dataset from /fishing/w/<slug>.json (precached by the service worker). */
export async function loadWater(slug: string): Promise<WaterDataset> {
  if (!KNOWN.has(slug)) throw new WaterNotFoundError(slug);
  const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;
  let res: Response;
  try {
    res = await fetch(`/fishing/w/${slug}.json`);
  } catch {
    throw new WaterNotCachedError(slug);
  }
  if (!res.ok) {
    if (offline()) throw new WaterNotCachedError(slug);
    throw new Error(`Could not load rules for "${slug}" (HTTP ${res.status})`);
  }
  return (await res.json()) as WaterDataset;
}
