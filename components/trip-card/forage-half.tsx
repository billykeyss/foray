"use client";

import Link from "next/link";
import type { SporeReading } from "@/lib/weather";

export interface ForagePick {
  id: string;
  name: string;
}

/** Fruiting score plus the top in-season edible species for this location/region. */
export default function ForageHalf({
  reading,
  loading,
  picks,
}: {
  reading: SporeReading | null;
  loading: boolean;
  picks: ForagePick[];
}) {
  return (
    <div className="kp-trip-half kp-trip-half--forage">
      <div className="kp-trip-half-head">
        <span className="kp-trip-dot kp-trip-dot--forage" aria-hidden />
        <span>Forage</span>
      </div>
      <div className="kp-trip-score">
        <span className="kp-trip-score-num">{reading ? reading.score : loading ? "…" : "—"}</span>
        <span className="kp-trip-score-unit">fruiting score</span>
      </div>
      {reading && picks.length > 0 ? (
        <ul className="kp-trip-picks" aria-label="In season">
          {picks.map((p) => (
            <li key={p.id}>
              <Link href={`/catalog/${p.id}`}>{p.name}</Link>
            </li>
          ))}
        </ul>
      ) : reading ? (
        <p className="kp-trip-empty">Nothing edible in season here</p>
      ) : null}
    </div>
  );
}
