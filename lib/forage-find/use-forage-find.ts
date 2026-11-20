"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserFindDeps } from "./browser.ts";
import type { HabitatProfile } from "./profiles.ts";
import { findForageSpots, type FindResult, type FindStep } from "./run.ts";
import { loadStoredFind, saveStoredFind } from "./store.ts";

export type FindState =
  | { kind: "idle" }
  | { kind: "running"; step: FindStep }
  | { kind: "done"; result: FindResult; cached: boolean }
  | { kind: "error"; message: string };

export interface FindRequest {
  profile: HabitatProfile;
  center: { lat: number; lon: number; label?: string };
  radiusKm: number;
}

const sameRequest = (r: FindResult, q: FindRequest) =>
  r.speciesId === q.profile.id &&
  r.radiusKm === q.radiusKm &&
  Math.abs(r.center.lat - q.center.lat) < 0.01 &&
  Math.abs(r.center.lon - q.center.lon) < 0.01;

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
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline && stored && stored.speciesId === q.profile.id) {
        setState({ kind: "done", result: stored, cached: true });
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
        // Weather, terrain and trees all failing means we're effectively offline: prefer the last good result.
        const blind = result.status !== "out-of-season" && result.notes.some((n) => n.startsWith("Weather unavailable")) && result.notes.some((n) => n.startsWith("Terrain unavailable"));
        if (blind && stored && stored.speciesId === q.profile.id) {
          setState({ kind: "done", result: stored, cached: true });
          return;
        }
        if (blind) {
          setState({ kind: "error", message: "Couldn't reach the weather or terrain services. Check your connection and try again." });
          return;
        }
        saveStoredFind(result);
        setState({ kind: "done", result, cached: false });
      } catch (e) {
        if ((e as Error)?.name === "AbortError" || ac.signal.aborted) return;
        if (stored && stored.speciesId === q.profile.id) setState({ kind: "done", result: stored, cached: true });
        else setState({ kind: "error", message: (e as Error)?.message || "Search failed" });
      } finally {
        if (ctrl.current === ac) ctrl.current = null;
      }
    },
    [allProfiles, today],
  );

  /** Show the stored result for a request without hitting the network (if it matches and is fresh enough). */
  const showStored = useCallback((q: FindRequest, maxAgeMs = Infinity): boolean => {
    const stored = loadStoredFind();
    if (stored && sameRequest(stored, q) && Date.now() - Date.parse(stored.at) <= maxAgeMs) {
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
