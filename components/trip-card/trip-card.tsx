"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Today's trip card. Phone: a bottom sheet with two snap points (peek ≈46dvh, expanded) toggled
 *  by the handle (tap, or a short vertical drag). Desktop (lg+): a scrollable left panel with the
 *  expanded content always shown. The tab bar (z-50) sits above the card, never under it. */
export default function TripCard({
  kicker,
  headline,
  forage,
  fish,
  onPlan,
  expanded,
  onExpandedChange,
  header,
  children,
}: {
  kicker: string;
  headline: string;
  forage: ReactNode;
  fish: ReactNode;
  onPlan: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Desktop-only header (the location chip row lives over the map on phone). */
  header?: ReactNode;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Back to the top when collapsing, so the peek always shows the summary.
  useEffect(() => {
    if (!expanded && !isDesktop) scrollRef.current?.scrollTo({ top: 0 });
  }, [expanded, isDesktop]);

  const open = isDesktop || expanded;

  return (
    <section
      className="kp kp-trip"
      data-expanded={expanded ? "true" : "false"}
      aria-label="Today's trip"
    >
      <div
        className="kp-trip-grab"
        onPointerDown={(e) => (drag.current = { y: e.clientY, moved: false })}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.moved) return;
          const dy = e.clientY - d.y;
          if (Math.abs(dy) > 24) {
            d.moved = true;
            onExpandedChange(dy < 0);
          }
        }}
        onPointerUp={() => {
          // A drag already snapped; the click that follows must not toggle back.
          setTimeout(() => (drag.current = null), 0);
        }}
      >
        <button
          type="button"
          className="kp-trip-handle"
          aria-label={expanded ? "Collapse today's trip" : "Expand today's trip"}
          aria-expanded={expanded}
          onClick={() => {
            if (drag.current?.moved) return;
            onExpandedChange(!expanded);
          }}
        />
      </div>
      <div ref={scrollRef} className="kp-trip-scroll">
        {header && <div className="kp-trip-header">{header}</div>}
        <div className="kp-trip-summary">
          <span className="kp-trip-kicker">{kicker}</span>
          <h1 className="kp-trip-headline">{headline}</h1>
          <div className="kp-trip-halves">
            {forage}
            {fish}
          </div>
          <button type="button" className="kp-trip-cta" onClick={onPlan}>
            Plan a spot with AI
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="kp-trip-detail" inert={!open} aria-hidden={!open}>
          {children}
        </div>
      </div>
    </section>
  );
}
