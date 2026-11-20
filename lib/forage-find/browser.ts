/** Real network dependencies for findForageSpots in the browser. */
import type { BurnCollection } from "./burns.ts";
import type { FindDeps } from "./run.ts";
import { browserFetchTile } from "./terrain.ts";

export const BURNS_URL = "/data/burns.geojson";
let burns: Promise<BurnCollection> | null = null;

function loadBurns(): Promise<BurnCollection> {
  burns ??= fetch(BURNS_URL).then((r) => {
    if (!r.ok) throw new Error(`burns HTTP ${r.status}`);
    return r.json() as Promise<BurnCollection>;
  });
  burns.catch(() => (burns = null));
  return burns;
}

export function browserFindDeps(signal?: AbortSignal): FindDeps {
  return {
    fetchJson: (url, init) => fetch(url, { signal: init?.signal ?? signal }),
    fetchTile: browserFetchTile(fetch, signal),
    loadBurns,
  };
}
