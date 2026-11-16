"use client";

import { useEffect, useMemo, useState } from "react";
import { loadWater, WaterNotCachedError } from "@/lib/fishing/load.ts";
import { checkCatch } from "@/lib/fishing/catch-check.ts";
import { searchWaters } from "@/lib/fishing/search.ts";
import { nearestWaters } from "@/lib/fishing/nearby.ts";
import { FISH_WATERS } from "@/lib/fishing/waters-index.ts";
import type { WaterDataset } from "@/lib/fishing/types.ts";

export interface CatchForm {
  waterSlug: string;
  species: string;
  length: string;
  kept: boolean;
  /** Optional reach key; empty = not sure. */
  reachId: string;
}

const BY_SLUG = new Map(FISH_WATERS.map((w) => [w.slug, w]));

/** Catch fields for the Journal form: water, species, length, kept, plus size/status hints. */
export default function JournalCatchFields({
  value,
  onChange,
  date,
  near,
}: {
  value: CatchForm;
  onChange: (patch: Partial<CatchForm>) => void;
  /** Device-local YYYY-MM-DD the rules are resolved for. */
  date: string;
  near: { lat: number; lon: number } | null;
}) {
  const [q, setQ] = useState("");
  const water = BY_SLUG.get(value.waterSlug);
  const hits = useMemo(() => (q.trim() ? searchWaters(q, 5) : []), [q]);

  // Default to the nearest water to the current location, once, when nothing is chosen.
  useEffect(() => {
    if (value.waterSlug || !near) return;
    const n = nearestWaters(near.lat, near.lon, 1, 50)[0];
    if (n) onChange({ waterSlug: n.slug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near?.lat, near?.lon]);

  const [ds, setDs] = useState<WaterDataset | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "not-cached" | "error">("idle");
  useEffect(() => {
    setDs(null);
    if (!value.waterSlug) return setState("idle");
    let live = true;
    setState("loading");
    loadWater(value.waterSlug).then(
      (d) => live && (setDs(d), setState("ready")),
      (e) => live && setState(e instanceof WaterNotCachedError ? "not-cached" : "error"),
    );
    return () => {
      live = false;
    };
  }, [value.waterSlug]);

  const len = value.length.trim() === "" ? undefined : Number(value.length);
  const check = useMemo(
    () => (ds ? checkCatch(ds, { species: value.species, length_in: len, kept: value.kept }, date, value.reachId || null) : null),
    [ds, value.species, len, value.kept, date, value.reachId],
  );

  return (
    <div className="kp kp-catch">
      <label htmlFor="catch-water">Water</label>
      {water ? (
        <div className="kp-spot-row" style={{ borderBottom: 0, padding: 0 }}>
          <span style={{ flex: 1, fontSize: 16 }}>
            {water.name} <small style={{ display: "inline", marginLeft: 4 }}>{water.states.join("/")}</small>
          </span>
          <button type="button" onClick={() => onChange({ waterSlug: "", reachId: "" })}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input id="catch-water" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a lake, river or reservoir" autoComplete="off" />
          {hits.length > 0 && (
            <div className="kp-catch-hits">
              {hits.map((h) => (
                <button
                  key={h.slug}
                  type="button"
                  onClick={() => {
                    onChange({ waterSlug: h.slug });
                    setQ("");
                  }}
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <label htmlFor="catch-species">Species</label>
      <input id="catch-species" type="text" list="catch-species-list" value={value.species} onChange={(e) => onChange({ species: e.target.value })} placeholder="Rainbow trout" autoComplete="off" />
      <datalist id="catch-species-list">
        {(water?.species ?? []).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="kp-catch-row">
        <div>
          <label htmlFor="catch-length">Length (in)</label>
          <input id="catch-length" type="number" inputMode="decimal" min={0} step={0.25} value={value.length} onChange={(e) => onChange({ length: e.target.value })} placeholder="12" />
        </div>
        <div>
          <label>Outcome</label>
          <div className="kp-seg" role="group" aria-label="Kept or released">
            <button type="button" aria-pressed={value.kept} onClick={() => onChange({ kept: true })}>
              Kept
            </button>
            <button type="button" aria-pressed={!value.kept} onClick={() => onChange({ kept: false })}>
              Released
            </button>
          </div>
        </div>
      </div>

      {ds && ds.reaches.length > 0 && (
        <>
          <label htmlFor="catch-reach">Section (optional)</label>
          <select id="catch-reach" value={value.reachId} onChange={(e) => onChange({ reachId: e.target.value })} className="kp-catch-select">
            <option value="">Not sure</option>
            {ds.reaches.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name ?? r.key}
              </option>
            ))}
          </select>
        </>
      )}

      {state === "not-cached" && <div className="kp-catch-note">Rules not downloaded. Size checks skipped; you can still save.</div>}
      {state === "error" && <div className="kp-catch-note">Couldn’t load rules. Size checks skipped; you can still save.</div>}
      {check?.warnings.map((w, i) => (
        <div key={i} className="kp-warn" role="status">
          <div>{w.text}</div>
          {(w.citation || w.sourceUrl || w.confidence) && (
            <div className="kp-warn-cite">
              {w.citation}
              {w.sourceUrl && (
                <>
                  {w.citation ? " · " : ""}
                  <a href={w.sourceUrl} target="_blank" rel="noreferrer">
                    source
                  </a>
                </>
              )}
              {w.confidence && ` · confidence ${w.confidence}`} · data as of {check.dataAsOf}
            </div>
          )}
        </div>
      ))}
      {check && check.warnings.some((w) => w.citation) && <div className="kp-catch-note">A hint, not legal advice. Check the current regulations.</div>}
    </div>
  );
}
