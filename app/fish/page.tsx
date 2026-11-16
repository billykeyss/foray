"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import GuideSegmented from "@/components/guide-segmented";
import { FISH_WATERS } from "@/lib/fishing/waters-index.ts";
import { searchWaters } from "@/lib/fishing/search.ts";
import { PNW_CATALOG } from "@/lib/species-catalog";
import { TREE_CATALOG } from "@/lib/tree-catalog";
import { EDIBLE_PLANTS } from "@/lib/plant-catalog";
import { OCEAN_CATALOG } from "@/lib/ocean-catalog";
import type { StockingRow } from "@/lib/chat/tools.ts";

const PAGE = 60;
const STOCK_ROWS = 20;
const FISH_SPECIES = Array.from(new Set(FISH_WATERS.flatMap((w) => w.species))).sort((a, b) => a.localeCompare(b));
const STATES = Array.from(new Set(FISH_WATERS.flatMap((w) => w.states))).sort();

const MONTH = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH[m]} ${d}, ${y}`;
}

function WaterLinks({ slug, name }: { slug: string; name: string }) {
  return (
    <div className="kp-fish-row-links">
      <Link className="kp-fish-link" href={`/?spot=${encodeURIComponent(slug)}`} aria-label={`${name} on the map`}>
        Map
      </Link>
      <Link className="kp-fish-link" href={`/fish/water?w=${encodeURIComponent(slug)}`} aria-label={`${name} rules`}>
        Rules
      </Link>
    </div>
  );
}

function RecentStocking() {
  const [rows, setRows] = useState<StockingRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/fishing/stocking-recent.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: StockingRow[]) => !cancelled && setRows(d.slice(0, STOCK_ROWS)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section aria-labelledby="stocking-h">
      <h2 id="stocking-h" className="kp-fish-h2">
        Recent stocking
      </h2>
      <p className="kp-fish-note">Newest agency stocking reports, as published. Confirm with the managing agency.</p>
      {failed && <p className="kp-fish-note">Stocking data isn’t available right now (offline?).</p>}
      {!rows && !failed && <p className="kp-fish-note">Loading…</p>}
      {rows && (
        <ul className="kp-fish-list">
          {rows.map((e, i) => (
            <li key={`${e.slug}-${e.date}-${e.species}-${i}`} className="kp-fish-row">
              <div className="kp-fish-row-main">
                <Link className="kp-fish-row-name" href={`/?spot=${encodeURIComponent(e.slug)}`}>
                  {e.waterName}
                </Link>
                <div className="kp-fish-stock-meta">
                  {fmtDate(e.date)} · {e.species}
                  {e.quantity != null ? ` · ${e.quantity.toLocaleString("en-US")}` : ""}
                  {e.sizeNote ? ` · ${e.sizeNote}` : ""}
                </div>
              </div>
              <WaterLinks slug={e.slug} name={e.waterName} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function FishPage() {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [species, setSpecies] = useState("");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const base = q.trim() ? searchWaters(q, FISH_WATERS.length) : FISH_WATERS;
    return base.filter((w) => (!state || w.states.includes(state)) && (!species || w.species.includes(species)));
  }, [q, state, species]);

  useEffect(() => setShown(PAGE), [q, state, species]);

  return (
    <main className="kp kp-fish">
      <div className="kp-fish-inner">
        <GuideSegmented
          mushroomCount={PNW_CATALOG.length}
          treeCount={TREE_CATALOG.length}
          plantCount={EDIBLE_PLANTS.length}
          oceanCount={OCEAN_CATALOG.filter((o) => o.group !== "hazard").length}
        />
        <h1 className="kp-fish-title">Fish</h1>
        <p className="kp-fish-lede">
          {FISH_WATERS.length} California and Nevada waters. Tap Rules for today’s status, with each rule’s citation and
          source. A convenience summary, not legal advice — confirm with the managing agency.
        </p>
        <div className="kp-fish-filters">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Water name"
            aria-label="Filter by water name"
          />
          <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state">
            <option value="">All states</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={species} onChange={(e) => setSpecies(e.target.value)} aria-label="Filter by fish species">
            <option value="">All fish species</option>
            {FISH_SPECIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="kp-fish-count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "water" : "waters"}
        </div>
        <ul className="kp-fish-list">
          {filtered.slice(0, shown).map((w) => (
            <li key={w.slug} className="kp-fish-row">
              <div className="kp-fish-row-main">
                <Link className="kp-fish-row-name" href={`/fish/water?w=${encodeURIComponent(w.slug)}`}>
                  {w.name}
                </Link>
                <div className="kp-fish-row-meta">
                  {w.waterType.charAt(0).toUpperCase() + w.waterType.slice(1)} · {w.states.join(", ")}
                  {w.species.length ? ` · ${w.species.slice(0, 3).join(", ")}` : ""}
                </div>
              </div>
              <WaterLinks slug={w.slug} name={w.name} />
            </li>
          ))}
        </ul>
        {filtered.length === 0 && <p className="kp-fish-note">No waters match those filters.</p>}
        {shown < filtered.length && (
          <button type="button" className="kp-fish-more" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({filtered.length - shown} left)
          </button>
        )}
        <RecentStocking />
      </div>
    </main>
  );
}
