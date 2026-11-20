"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FindState } from "@/lib/forage-find/use-forage-find.ts";
import type { FindResult, FoundSpot, FindStep } from "@/lib/forage-find/run.ts";
import type { SeasonStatus } from "@/lib/forage-find/profiles.ts";
import { fmtElev, fmtRain, fmtTemp, reasonText, unitSystemFor, type UnitSystem } from "@/lib/forage-find/format.ts";

export interface PickerItem {
  id: string;
  name: string;
  scientific: string;
  /** "Apr–Aug" */
  months: string;
  status: SeasonStatus;
}

const STEPS: { key: Exclude<FindStep, "done">; label: string }[] = [
  { key: "weather", label: "Weather" },
  { key: "terrain", label: "Terrain" },
  { key: "trees", label: "Trees" },
];

/** "just now", "25 min ago", "2 h ago", "3 d ago". */
function fmtAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** Apple Maps on Apple devices, a geo: intent on Android, Google Maps directions elsewhere. */
export function directionsHref(lat: number, lon: number, ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): string {
  const ll = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return `https://maps.apple.com/?daddr=${ll}`;
  if (/Android/.test(ua)) return `geo:${ll}?q=${ll}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
}

function seasonText(r: Pick<FindResult, "season">): string {
  if (r.season.status === "peak") return "Peak now";
  if (r.season.status === "in") return "In season";
  return `Out of season · ${r.season.months}`;
}

function Conditions({ result, speciesSeason, u }: { result: FindResult | null; speciesSeason: string | null; u: UnitSystem }) {
  const c = result?.conditions;
  const cells: [string, string][] = [
    ["Rain 7d", c ? fmtRain(c.rain7dMm, u) : "—"],
    ["Humidity", c?.humidityPct != null ? `${c.humidityPct}%` : "—"],
    ["Soil", c?.soilTempC != null ? fmtTemp(c.soilTempC, u) : "—"],
  ];
  return (
    <div className="kp-find-cond" aria-label="Conditions at the search centre, past 7 days">
      {cells.map(([k, v]) => (
        <div key={k} className="kp-find-cond-cell">
          <span className="kp-find-cond-k">{k}</span>
          <span className="kp-find-cond-v">{v}</span>
        </div>
      ))}
      <div className="kp-find-cond-cell kp-find-cond-season" data-status={result?.season.status ?? "in"}>
        <span className="kp-find-cond-k">Season</span>
        <span className="kp-find-cond-v">{result ? seasonText(result) : (speciesSeason ?? "—")}</span>
      </div>
    </div>
  );
}

function Progress({ step, onCancel }: { step: FindStep; onCancel: () => void }) {
  const at = STEPS.findIndex((s) => s.key === step);
  return (
    <div className="kp-find-progress" role="status" aria-live="polite">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.key} data-state={i < at ? "done" : i === at ? "active" : "todo"}>
            <span className="kp-find-step-dot" aria-hidden />
            {s.label}
            {i === at && <span className="sr-only"> in progress</span>}
          </li>
        ))}
      </ol>
      <button type="button" className="kp-find-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function SpotRow({
  spot,
  selected,
  saved,
  unit,
  onSelect,
  onSave,
  onLog,
}: {
  spot: FoundSpot;
  selected: boolean;
  saved: boolean;
  unit: UnitSystem;
  onSelect: () => void;
  onSave: () => void;
  onLog: () => void;
}) {
  const good = spot.reasons.filter((r) => r.good).slice(0, 5);
  const bad = spot.reasons.filter((r) => !r.good).slice(0, 3);
  const elev = spot.elevationM == null ? null : fmtElev(spot.elevationM, unit);
  return (
    <li className="kp-find-row" data-selected={selected ? "true" : "false"} data-find-rank={spot.rank}>
      <button type="button" className="kp-find-row-main" onClick={onSelect} aria-pressed={selected} aria-label={`Spot ${spot.rank}: ${spot.label}, score ${spot.score}. Show on map`}>
        <span className="kp-find-badge" aria-hidden>
          {spot.rank}
        </span>
        <span className="kp-find-row-body">
          <span className="kp-find-row-top">
            <span className="kp-find-row-label">{spot.label}</span>
            <span className="kp-find-score">{spot.score}</span>
          </span>
          <span className="kp-find-row-meta">
            {elev && <span>{elev}</span>}
            <span className="kp-find-bar" aria-hidden>
              <span style={{ width: `${Math.max(4, spot.score)}%` }} />
            </span>
          </span>
        </span>
      </button>
      {(good.length > 0 || bad.length > 0) && (
        <ul className="kp-find-chips" aria-label="Why">
          {good.map((r, i) => (
            <li key={`g${i}`} className="kp-find-chip">
              {reasonText(r, unit)}
            </li>
          ))}
          {bad.map((r, i) => (
            <li key={`b${i}`} className="kp-find-chip kp-find-chip--bad">
              {reasonText(r, unit)}
            </li>
          ))}
        </ul>
      )}
      {spot.cautions.length > 0 && <p className="kp-find-row-caution">{spot.cautions.join(" ")}</p>}
      <div className="kp-find-actions">
        <button type="button" className="kp-find-act" onClick={onSave} disabled={saved} aria-label={saved ? `Spot ${spot.rank} saved` : `Save spot ${spot.rank}`}>
          {saved ? "Saved ✓" : "Save spot"}
        </button>
        <a className="kp-find-act" href={directionsHref(spot.lat, spot.lon)} target="_blank" rel="noopener noreferrer">
          Directions
        </a>
        <button type="button" className="kp-find-act" onClick={onLog}>
          Log find
        </button>
      </div>
    </li>
  );
}

function SeasonChips({ items, onPick }: { items: FindResult["inSeasonNow"]; onPick: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="kp-find-season">
      <span className="kp-find-season-h">In season now:</span>
      <ul>
        {items.map((s) => (
          <li key={s.id}>
            <button type="button" className="kp-find-pill" onClick={() => onPick(s.id)}>
              {s.name}
              {s.peak && <span className="kp-find-pill-peak"> · peak</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Picker({ items, current, onPick, onClose }: { items: PickerItem[]; current: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.name.toLowerCase().includes(t) || i.scientific.toLowerCase().includes(t)) : items;
  }, [items, q]);
  const inSeason = filtered.filter((i) => i.status !== "out");
  const out = filtered.filter((i) => i.status === "out");
  const row = (i: PickerItem) => (
    <li key={i.id}>
      <button type="button" className="kp-find-pick" aria-current={i.id === current ? "true" : undefined} onClick={() => onPick(i.id)}>
        <span className="kp-find-pick-name">{i.name}</span>
        <span className="kp-find-pick-sub">
          <i>{i.scientific}</i> · {i.status === "peak" ? "peak now" : i.months}
        </span>
      </button>
    </li>
  );
  return (
    <div className="kp-find-picker" role="dialog" aria-label="Choose a species">
      <div className="kp-find-picker-field">
        <input ref={ref} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter species" aria-label="Filter species" autoComplete="off" spellCheck={false} />
        <button type="button" className="kp-find-btn" onClick={onClose}>
          Done
        </button>
      </div>
      {inSeason.length > 0 && (
        <>
          <h3 className="kp-find-h">In season now</h3>
          <ul className="kp-find-picks">{inSeason.map(row)}</ul>
        </>
      )}
      {out.length > 0 && (
        <>
          <h3 className="kp-find-h">Out of season</h3>
          <ul className="kp-find-picks">{out.map(row)}</ul>
        </>
      )}
      {!filtered.length && <p className="kp-find-empty">No findable species match “{q.trim()}”.</p>}
    </div>
  );
}

export interface FindSheetProps {
  species: PickerItem | null;
  pickerItems: PickerItem[];
  radiusKm: number;
  radii: readonly number[];
  onSpecies: (id: string) => void;
  onRadius: (km: number) => void;
  state: FindState;
  hasLocation: boolean;
  locationLabel: string;
  onSetLocation: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
  selectedRank: number | null;
  onSelect: (rank: number) => void;
  isSaved: (spot: FoundSpot) => boolean;
  onSave: (spot: FoundSpot, r: FindResult) => void;
  onLogFind: (spot: FoundSpot, r: FindResult) => void;
  elevUnit: "m" | "ft";
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  /** Desktop-only header (the location chip row). */
  header?: ReactNode;
}

/** The Find sheet: phone bottom sheet in the trip card's place, desktop left panel. Prop-driven. */
export default function FindSheet(p: FindSheetProps) {
  const [picking, setPicking] = useState(!p.species);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Escape closes the picker, then the sheet, but only when focus is in the sheet or nowhere in
    // particular: never when another dialog, input or sheet has focus.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const a = document.activeElement;
      const inSheet = !!a && !!sectionRef.current?.contains(a);
      if (!inSheet && a && a !== document.body) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (picking && p.species) setPicking(false);
      else p.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, p]);

  const u = unitSystemFor(p.elevUnit);
  const result = p.state.kind === "done" ? p.state.result : null;
  const stale = p.state.kind === "done" && !!p.state.stale;
  // A shown result always speaks for its own search: its centre and radius, not the current ones.
  const nearLabel = result ? result.center.label : p.locationLabel;
  const shownRadius = result ? result.radiusKm : p.radiusKm;
  const pick = (id: string) => {
    setPicking(false);
    p.onSpecies(id);
  };
  const seasonFallback = p.species ? (p.species.status === "peak" ? "Peak now" : p.species.status === "in" ? "In season" : `Out of season · ${p.species.months}`) : null;

  return (
    <section ref={sectionRef} className="kp kp-trip kp-find" data-expanded={p.expanded ? "true" : "false"} aria-label="Find spots">
      <div className="kp-trip-grab">
        <button
          type="button"
          className="kp-trip-handle"
          aria-label={p.expanded ? "Collapse find spots" : "Expand find spots"}
          aria-expanded={p.expanded}
          onClick={() => p.onExpandedChange(!p.expanded)}
        />
      </div>
      <div className="kp-trip-scroll kp-find-scroll">
        {p.header && <div className="kp-trip-header">{p.header}</div>}
        <div className="kp-find-head">
          <span className="kp-trip-kicker">FIND SPOTS{p.hasLocation || result ? ` · NEAR ${nearLabel.toUpperCase()}` : ""}</span>
          <button type="button" className="kp-find-close" aria-label="Close find spots" onClick={p.onClose}>
            ×
          </button>
        </div>
        <div className="kp-find-controls">
          <button type="button" className="kp-find-species" aria-expanded={picking} aria-haspopup="dialog" onClick={() => setPicking((v) => !v)}>
            <span className="kp-trip-dot kp-trip-dot--forage" aria-hidden />
            <span className="kp-find-species-name">{p.species?.name ?? "Choose a species"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div className="kp-find-radius" role="group" aria-label="Search radius">
            {p.radii.map((r) => (
              <button key={r} type="button" aria-pressed={shownRadius === r} onClick={() => p.onRadius(r)}>
                {r} km
              </button>
            ))}
          </div>
        </div>

        {picking ? (
          <Picker items={p.pickerItems} current={p.species?.id ?? null} onPick={pick} onClose={() => setPicking(false)} />
        ) : !p.hasLocation ? (
          <div className="kp-find-empty-state">
            <p>Set a location first: spots are scored around it.</p>
            <button type="button" className="kp-find-btn kp-find-btn--primary" onClick={p.onSetLocation}>
              Set a location
            </button>
          </div>
        ) : (
          <>
            {stale && result && (
              <p className="kp-find-stale" role="status">
                Saved result near {result.center.label} · {result.radiusKm} km · {fmtAgo(result.at)}. Couldn’t search here right now.
              </p>
            )}
            <Conditions result={result} speciesSeason={seasonFallback} u={u} />
            {p.state.kind === "running" && <Progress step={p.state.step} onCancel={p.onCancel} />}
            {p.state.kind === "idle" && p.species && (
              <div className="kp-find-empty-state">
                <p>Search cancelled.</p>
                <button type="button" className="kp-find-btn kp-find-btn--primary" onClick={p.onRetry}>
                  Search again
                </button>
              </div>
            )}
            {p.state.kind === "error" && (
              <div className="kp-find-empty-state" role="alert">
                <p>{p.state.message}</p>
                <button type="button" className="kp-find-btn kp-find-btn--primary" onClick={p.onRetry}>
                  Retry
                </button>
              </div>
            )}
            {result && (
              <>
                <p className="kp-find-msg" data-status={result.status}>
                  {result.message}
                </p>
                {(result.status === "poor" || result.status === "out-of-season") && <SeasonChips items={result.inSeasonNow} onPick={pick} />}
                {result.spots.length > 0 && (
                  <ol className="kp-find-list">
                    {result.spots.map((s) => (
                      <SpotRow
                        key={`${s.rank}-${s.lat}-${s.lon}`}
                        spot={s}
                        selected={p.selectedRank === s.rank}
                        saved={p.isSaved(s)}
                        unit={u}
                        onSelect={() => p.onSelect(s.rank)}
                        onSave={() => p.onSave(s, result)}
                        onLog={() => p.onLogFind(s, result)}
                      />
                    ))}
                  </ol>
                )}
                <footer className="kp-find-foot">
                  {p.state.kind === "done" && p.state.cached && !stale && (
                    <p className="kp-find-cached">
                      Saved result near {result.center.label} · {result.radiusKm} km · {fmtAgo(result.at)}
                    </p>
                  )}
                  {result.notes.map((n) => (
                    <p key={n} className="kp-find-note">
                      {n}
                    </p>
                  ))}
                  {result.cautions.map((c) => (
                    <p key={c} className="kp-find-caution">
                      {c}
                    </p>
                  ))}
                  <p className="kp-find-fine">
                    Scores are habitat odds from the past week’s weather, terrain, tree cover (LANDFIRE) and burn scars, not
                    sightings.
                  </p>
                </footer>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
