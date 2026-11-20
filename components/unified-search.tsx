"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { searchWaters } from "@/lib/fishing/search.ts";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface SpeciesHit {
  id: string;
  common: string;
  scientific: string;
  href: string;
  /** Offered as a Forage Finder target (edible, not dangerous). */
  findable?: boolean;
}

/** One search across fishing waters and species. Prop-driven: the page supplies species search
 *  (components don't import catalogs). Escape closes; ArrowUp/Down move between results. */
export default function UnifiedSearch({
  searchSpecies,
  onOpenWater,
  onOpenSpecies,
  onFindSpecies,
  onChangeLocation,
  onClose,
}: {
  searchSpecies: (q: string) => SpeciesHit[];
  onOpenWater: (slug: string) => void;
  onOpenSpecies: (hit: SpeciesHit) => void;
  /** "Find spots for {species}": opens the Find sheet on the map. */
  onFindSpecies?: (hit: SpeciesHit) => void;
  onChangeLocation: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const waters = useMemo(() => searchWaters(q, 6), [q]);
  const species = useMemo(() => (q.trim() ? searchSpecies(q.trim()) : []).slice(0, 5), [q, searchSpecies]);
  const hasQuery = q.trim().length > 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-result]") ?? []);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "ArrowDown" ? Math.min(i + 1, items.length - 1) : i - 1;
      (next < 0 ? inputRef.current : items[next])?.focus();
    }
  };

  return (
    <div className="kp kp-search" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
      <button type="button" className="kp-search-scrim" aria-label="Close search" tabIndex={-1} onClick={onClose} />
      <div className="kp-search-panel">
        <div className="kp-search-field">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search waters, fish, mushrooms, plants"
            aria-label="Search waters and species"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="kp-search-x" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="kp-search-list" ref={listRef}>
          {waters.length > 0 && (
            <section aria-label="Waters">
              <h2 className="kp-search-h">Waters</h2>
              {waters.map((w) => (
                <button key={w.slug} type="button" data-result className="kp-search-row" onClick={() => onOpenWater(w.slug)}>
                  <span className="kp-search-name">{w.name}</span>
                  <span className="kp-search-sub">
                    {cap(w.waterType)} · {w.states.join(", ")}
                  </span>
                </button>
              ))}
            </section>
          )}
          {species.length > 0 && (
            <section aria-label="Species">
              <h2 className="kp-search-h">Species</h2>
              {species.map((s) => (
                <Fragment key={s.id}>
                  <button type="button" data-result className="kp-search-row" onClick={() => onOpenSpecies(s)}>
                    <span className="kp-search-name">{s.common}</span>
                    <span className="kp-search-sub kp-search-sci">{s.scientific}</span>
                  </button>
                  {s.findable && onFindSpecies && (
                    <button type="button" data-result className="kp-search-row kp-search-row--find" onClick={() => onFindSpecies(s)}>
                      <span className="kp-search-name">Find spots for {s.common}</span>
                      <span className="kp-search-sub">Score nearby ground by weather, terrain, trees and burns</span>
                    </button>
                  )}
                </Fragment>
              ))}
            </section>
          )}
          {hasQuery && waters.length === 0 && species.length === 0 && (
            <p className="kp-search-empty">Nothing matches “{q.trim()}”.</p>
          )}
          <section aria-label="Location">
            <h2 className="kp-search-h">Location</h2>
            <button type="button" data-result className="kp-search-row" onClick={onChangeLocation}>
              <span className="kp-search-name">Change location</span>
              <span className="kp-search-sub">Pick a preset, use GPS, or paste coordinates</span>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
