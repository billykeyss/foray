"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Today's trip card. Phone: a bottom sheet with two snap points (peek ≈46dvh, grown just enough
 *  to keep the whole summary above the tab bar when it's taller, e.g. a two-line water name; expanded) toggled
 *  by the handle (tap, or a short vertical drag). Desktop (lg+): a scrollable left panel with the
 *  expanded content always shown. The tab bar (z-50) sits above the card, never under it. */
/** Room kept above the phone peek for the map controls (they end ~316px down) plus a strip of map. */
export const PEEK_TOP_RESERVE = 340;

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
  onPeekChange,
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
  /** Phone peek height in px (also published as the --kp-trip-peek CSS variable on <html>). */
  onPeekChange?: (px: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const peekCb = useRef(onPeekChange);
  peekCb.current = onPeekChange;
  const [isDesktop, setIsDesktop] = useState(false);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Peek = max(46% of the viewport, what the summary needs to clear the tab bar), but never so
  // tall that it covers the map's control column (top 116px + 4×44px buttons) and the map itself.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const padBottom = parseFloat(getComputedStyle(scroll).paddingBottom) || 0;
      // padBottom = tab bar + 16px breathing room under the CTA.
      const needed = (grabRef.current?.offsetHeight ?? 0) + (summaryRef.current?.offsetHeight ?? 0) + padBottom;
      const vh = window.innerHeight;
      const px = Math.round(Math.max(vh * 0.46, Math.min(needed, vh - PEEK_TOP_RESERVE)));
      root.style.setProperty("--kp-trip-peek", `${px}px`);
      peekCb.current?.(px);
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (summaryRef.current) ro?.observe(summaryRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      root.style.removeProperty("--kp-trip-peek");
    };
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
        ref={grabRef}
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
        onPointerCancel={() => (drag.current = null)}
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
        <div ref={summaryRef} className="kp-trip-summary">
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
