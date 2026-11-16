"use client";

import { useEffect, useState } from "react";
import { loadWater, WaterNotCachedError } from "@/lib/fishing/load.ts";
import { resolveDataset } from "@/lib/fishing/resolve.ts";
import { localIsoDate } from "@/lib/fishing/local-date.ts";
import { nearestWaters } from "@/lib/fishing/nearby.ts";
import { StatusStamp } from "@/components/fishing/status-stamp";
import type { FishRowState } from "@/lib/trip-headline.ts";
import { sunTimes } from "@/lib/daylight.ts";
import { fishingHoursWindow, fmtClock } from "@/lib/fishing-hours.ts";
import { licenseWarning } from "@/lib/license.ts";
import { useLicense } from "@/lib/use-license.ts";
import type { SerializedRule } from "@/lib/fishing/engine/types.ts";

/** Today's legal fishing hours for one water, with the rule it comes from. */
export interface RowHours {
  /** Clock window, or the rule's own text when its TimeSpec can't be interpreted. */
  text: string;
  citation: string | null;
  confidence: string;
}

function hoursFor(rule: SerializedRule, lat: number, lon: number, today: Date): RowHours {
  const d = rule.detail as Record<string, unknown>;
  const w = fishingHoursWindow(d, lat, lon, today);
  const text = w
    ? `${fmtClock(w.from)}–${fmtClock(w.to)}`
    : d.basis === "any_hour"
      ? "Any hour"
      : rule.summary;
  return { text, citation: rule.citation, confidence: rule.confidence };
}

/** `state.ready` carries today's resolved status; `not-cached` = offline and never downloaded. */
export interface FishRow extends FishRowState {
  slug: string;
  name: string;
  waterType: string;
  distanceMi: number;
  states: string[];
  /** Today's legal hours, when a `fishing_hours` rule is in force. */
  hours?: RowHours | null;
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
    const base = near.map((w) => ({ slug: w.slug, name: w.name, waterType: w.waterType, distanceMi: w.distanceMi, states: w.states, lat: w.lat, lon: w.lon }));
    setRows(base.map((w) => ({ ...w, state: { kind: "loading" } })));
    const today = localIsoDate();
    Promise.all(
      base.map(async (w): Promise<FishRow> => {
        try {
          const ds = await loadWater(w.slug);
          const res = resolveDataset(ds, today);
          const rule = res.scopes
            .flatMap((sc) => sc.rules)
            .find((r) => r.ruleType === "fishing_hours" && r.polarity !== "asserts_none");
          const hours = rule ? hoursFor(rule, w.lat, w.lon, new Date()) : null;
          return { slug: w.slug, name: w.name, waterType: w.waterType, distanceMi: w.distanceMi, states: w.states, hours, state: { kind: "ready", status: res.status.overall } };
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

const fmtMi = (d: number) => `${d < 10 ? d.toFixed(1) : Math.round(d)} mi`;

export default function FishHalf({
  rows,
  lat,
  lon,
  hasLocation,
  onSetLocation,
  onWaterTap,
}: {
  rows: FishRow[] | null;
  lat: number | null;
  lon: number | null;
  hasLocation: boolean;
  onSetLocation: () => void;
  onWaterTap: (slug: string) => void;
}) {
  const { licenses } = useLicense();
  const [sun, setSun] = useState<string | null>(null);
  useEffect(() => {
    if (lat == null || lon == null) return setSun(null);
    const t = sunTimes(lat, lon, new Date());
    setSun(Number.isNaN(t.sunrise.getTime()) ? null : `↑ ${fmtClock(t.sunrise)} · ↓ ${fmtClock(t.sunset)}`);
  }, [lat, lon]);
  const nearest = rows?.[0];
  const warning = nearest ? licenseWarning(licenses, nearest.states, localIsoDate()) : null;
  return (
    <div className="kp-trip-half kp-trip-half--fish">
      <div className="kp-trip-half-head">
        <span className="kp-trip-dot kp-trip-dot--fish" aria-hidden />
        <span>Fish</span>
        {hasLocation && sun && <span className="kp-trip-sun" aria-label="Sunrise and sunset today">{sun}</span>}
      </div>
      {warning && <p className="kp-trip-license" role="status">{warning}</p>}
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
                <span className="kp-trip-water-title">{r.name}</span>
                <span className="kp-trip-water-meta">
                  <span className="kp-trip-water-dist">
                    {fmtMi(r.distanceMi)} · <span className="kp-trip-water-type">{r.waterType}</span>
                  </span>
                  {r.state.kind === "ready" ? (
                    <StatusStamp status={r.state.status} size="sm" short />
                  ) : r.state.kind === "loading" ? (
                    <span className="kp-trip-pending" aria-label="Checking rules">…</span>
                  ) : (
                    <StatusStamp status="unknown" size="sm" short />
                  )}
                </span>
                {r.hours && (
                  <span
                    className="kp-trip-water-hours"
                    title={`${r.hours.citation ?? "Fishing hours"} · ${r.hours.confidence} confidence · tap for rules`}
                  >
                    Hrs {r.hours.text}
                  </span>
                )}
                {r.state.kind === "not-cached" && <span className="kp-trip-water-note">Not downloaded</span>}
                {r.state.kind === "error" && <span className="kp-trip-water-note">Couldn’t load rules</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
