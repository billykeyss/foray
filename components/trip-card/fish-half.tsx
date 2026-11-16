"use client";

import { useEffect, useState } from "react";
import type { ScopeStatus } from "@/lib/fishing/engine/types.ts";
import { loadWater, WaterNotCachedError } from "@/lib/fishing/load.ts";
import { resolveDataset } from "@/lib/fishing/resolve.ts";
import { localIsoDate } from "@/lib/fishing/local-date.ts";
import { nearestWaters } from "@/lib/fishing/nearby.ts";
import { StatusStamp } from "@/components/fishing/status-stamp";

export interface FishRow {
  slug: string;
  name: string;
  distanceMi: number;
  /** `ready` carries today's resolved status; `not-cached` = offline and never downloaded. */
  state: { kind: "loading" } | { kind: "ready"; status: ScopeStatus } | { kind: "not-cached" } | { kind: "error" };
}

/** The 3 nearest waters (default 50 mi radius), each resolved for the device's local date.
 *  A row that can't load degrades on its own; it never fails the whole list. */
export function useNearbyFish(lat: number | null, lon: number | null): FishRow[] | null {
  const [rows, setRows] = useState<FishRow[] | null>(null);
  useEffect(() => {
    if (lat == null || lon == null) {
      setRows(null);
      return;
    }
    let cancelled = false;
    const near = nearestWaters(lat, lon, 3);
    const base = near.map((w) => ({ slug: w.slug, name: w.name, distanceMi: w.distanceMi }));
    setRows(base.map((w) => ({ ...w, state: { kind: "loading" } })));
    const today = localIsoDate();
    Promise.all(
      base.map(async (w): Promise<FishRow> => {
        try {
          const ds = await loadWater(w.slug);
          return { ...w, state: { kind: "ready", status: resolveDataset(ds, today).status.overall } };
        } catch (err) {
          return { ...w, state: err instanceof WaterNotCachedError ? { kind: "not-cached" } : { kind: "error" } };
        }
      }),
    ).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);
  return rows;
}

/** Statuses of the rows that resolved, for the headline. */
export function fishStatuses(rows: FishRow[] | null): ScopeStatus[] {
  return (rows ?? []).flatMap((r) => (r.state.kind === "ready" ? [r.state.status] : []));
}

const fmtMi = (d: number) => `${d < 10 ? d.toFixed(1) : Math.round(d)} mi`;

export default function FishHalf({
  rows,
  hasLocation,
  onSetLocation,
  onWaterTap,
}: {
  rows: FishRow[] | null;
  hasLocation: boolean;
  onSetLocation: () => void;
  onWaterTap: (slug: string) => void;
}) {
  return (
    <div className="kp-trip-half kp-trip-half--fish">
      <div className="kp-trip-half-head">
        <span className="kp-trip-dot kp-trip-dot--fish" aria-hidden />
        <span>Fish</span>
      </div>
      {!hasLocation ? (
        <button type="button" className="kp-trip-empty kp-trip-empty--btn" onClick={onSetLocation}>
          Set a location
        </button>
      ) : rows && rows.length === 0 ? (
        <p className="kp-trip-empty">No fishing data for this area yet</p>
      ) : (
        <ul className="kp-trip-waters">
          {(rows ?? []).map((r) => (
            <li key={r.slug}>
              <button type="button" className="kp-trip-water" onClick={() => onWaterTap(r.slug)}>
                <span className="kp-trip-water-name">
                  <span className="kp-trip-water-title" title={r.name}>{r.name}</span>
                  <span className="kp-trip-water-dist">{fmtMi(r.distanceMi)}</span>
                </span>
                {r.state.kind === "ready" ? (
                  <StatusStamp status={r.state.status} size="sm" short />
                ) : r.state.kind === "loading" ? (
                  <span className="kp-trip-pending" aria-label="Checking rules">…</span>
                ) : (
                  <span
                    className="status-stamp status-stamp--sm kp-trip-miss"
                    data-status="unknown"
                    title={r.state.kind === "not-cached" ? "Rules not downloaded" : "Couldn’t load rules"}
                  >
                    {r.state.kind === "not-cached" ? "Not downloaded" : "CHECK"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
