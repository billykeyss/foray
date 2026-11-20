"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserFindDeps } from "./browser.ts";
import type { HabitatProfile } from "./profiles.ts";
import { findForageSpots, type FindResult, type FindStep } from "./run.ts";
import { loadStoredFind, matchStored, saveStoredFind, shouldStoreFind } from "./store.ts";

export type FindState =
  | { kind: "idle" }
  | { kind: "running"; step: FindStep }
  /** cached: a stored result, not a fresh run. stale: stored for a different centre or radius, so the
   *  sheet must label it with its own place/radius/time instead of the current ones. */
  | { kind: "done"; result: FindResult; cached: boolean; stale?: boolean }
  | { kind: "error"; message: string };

export interface FindRequest {
  profile: HabitatProfile;
  center: { lat: number; lon: number; label?: string };
  radiusKm: number;
}

const match = (stored: FindResult | null, q: FindRequest) =>
  matchStored(stored, { speciesId: q.profile.id, lat: q.center.lat, lon: q.center.lon, radiusKm: q.radiusKm });

/** Runs Forage Finder searches in the browser: progress, cancel, and the last result cached in
 *  localStorage (shown, labelled with its time, when the network is out). */
export function useForageFind(allProfiles: HabitatProfile[], today: string) {
  const [state, setState] = useState<FindState>({ kind: "idle" });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const cancel = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setState((s) => (s.kind === "running" ? { kind: "idle" } : s));
  }, []);

  const run = useCallback(
    async (q: FindRequest) => {
      ctrl.current?.abort();
      const ac = new AbortController();
      ctrl.current = ac;
      const stored = loadStoredFind();
      const m = match(stored, q);
      const fallback = () => (m && stored ? ({ kind: "done", result: stored, cached: true, stale: m === "other" } as const) : null);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline && m) {
        setState(fallback()!);
        return;
      }
      setState({ kind: "running", step: "weather" });
      try {
        const result = await findForageSpots({
          profile: q.profile,
          allProfiles,
          center: q.center,
          radiusKm: q.radiusKm,
          today,
          deps: browserFindDeps(ac.signal),
          signal: ac.signal,
          onProgress: (step) => {
            if (!ac.signal.aborted && step !== "done") setState({ kind: "running", step });
          },
        });
        if (ac.signal.aborted) return;
        // Confidence is decided inside findForageSpots (shared with the Ask tool): "unavailable" has no
        // pins and is never stored; "low-confidence" is shown live but never replaces a good result.
        if (result.status === "unavailable") {
          setState(fallback() ?? { kind: "error", message: result.message });
          return;
        }
        if (shouldStoreFind(result)) saveStoredFind(result);
        setState({ kind: "done", result, cached: false });
      } catch (e) {
        if ((e as Error)?.name === "AbortError" || ac.signal.aborted) return;
        setState(fallback() ?? { kind: "error", message: (e as Error)?.message || "Search failed" });
      } finally {
        if (ctrl.current === ac) ctrl.current = null;
      }
    },
    [allProfiles, today],
  );

  /** Show the stored result for a request without hitting the network (if it matches and is fresh enough). */
  const showStored = useCallback((q: FindRequest, maxAgeMs = Infinity): boolean => {
    const stored = loadStoredFind();
    if (stored && match(stored, q) === "exact" && Date.now() - Date.parse(stored.at) <= maxAgeMs) {
      ctrl.current?.abort();
      setState({ kind: "done", result: stored, cached: true });
      return true;
    }
    return false;
  }, []);

  const reset = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setState({ kind: "idle" });
  }, []);

  return { state, run, cancel, reset, showStored };
}
