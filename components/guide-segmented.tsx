"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Segmented control rendered at the top of the Guide pages (`/catalog`
 * and `/trees`). Lets the user pivot between the mushroom catalog and
 * the tree-partner catalog without going back to the tab bar.
 */
export default function GuideSegmented({
  mushroomCount,
  treeCount,
  plantCount,
  oceanCount,
}: {
  mushroomCount: number;
  treeCount: number;
  plantCount: number;
  oceanCount: number;
}) {
  const pathname = usePathname();
  const isMushrooms = pathname.startsWith("/catalog");
  const isTrees = pathname.startsWith("/trees");
  const isPlants = pathname.startsWith("/plants");
  const isOcean = pathname.startsWith("/ocean");
  const isFish = pathname.startsWith("/fish");

  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const updateFade = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setFade({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);
  // Keep the active segment visible when the strip overflows (phone width).
  useEffect(() => {
    const el = ref.current;
    el?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
    updateFade();
  }, [pathname, updateFade]);
  useEffect(() => {
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, [updateFade]);
  const edge = (on: boolean) => (on ? "transparent" : "#000");
  const mask = `linear-gradient(to right, ${edge(fade.left)} 0, #000 28px, #000 calc(100% - 28px), ${edge(fade.right)} 100%)`;

  return (
    <div
      ref={ref}
      onScroll={updateFade}
      className="font-mono mb-5 [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Guide section"
      style={{
        display: "inline-flex",
        maxWidth: "100%",
        overflowX: "auto",
        scrollbarWidth: "none",
        WebkitMaskImage: mask,
        maskImage: mask,
        padding: 4,
        border: "1px solid var(--line)",
        borderRadius: 999,
        background: "rgba(250,245,233,0.7)",
        gap: 2,
      }}
    >
      <Segment
        href="/catalog"
        active={isMushrooms}
        label="Mushrooms"
        count={mushroomCount}
        icon={<MushIcon />}
      />
      <Segment
        href="/trees"
        active={isTrees}
        label="Trees"
        count={treeCount}
        icon={<TreeIcon />}
      />
      <Segment
        href="/plants"
        active={isPlants}
        label="Greens"
        count={plantCount}
        icon={<LeafIcon />}
      />
      <Segment
        href="/ocean"
        active={isOcean}
        label="Tide"
        count={oceanCount}
        icon={<WaveIcon />}
      />
      <Segment
        href="/fish"
        active={isFish}
        label="Fish"
        icon={<FishIcon />}
      />
    </div>
  );
}

function Segment({
  href,
  active,
  label,
  count,
  icon,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        background: active ? "var(--moss)" : "transparent",
        color: active ? "var(--parchment)" : "var(--ink-soft)",
        fontSize: 10.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        textDecoration: "none",
        transition: "background 160ms ease, color 160ms ease",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          opacity: active ? 1 : 0.6,
        }}
      >
        {icon}
      </span>
      {label}
      {count != null && (
        <span
          style={{
            opacity: active ? 0.7 : 0.5,
            fontSize: 9.5,
            letterSpacing: "0.1em",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function MushIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 80 100" aria-hidden>
      <path
        d="M10 35 Q10 12, 40 12 Q70 12, 70 35 Q70 42, 60 42 L20 42 Q10 42, 10 35 Z"
        fill="currentColor"
      />
      <path
        d="M30 42 L30 75 Q30 88, 40 88 Q50 88, 50 75 L50 42"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 L7 10 L9 10 L5.5 15 L8 15 L4 21 L20 21 L16 15 L18.5 15 L15 10 L17 10 Z" />
      <rect x="11" y="20" width="2" height="3" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinejoin="round"
      aria-hidden
    >
      {/* A single sprig — leaf blade with a midrib stem */}
      <path d="M20 4 C10 4, 4 10, 4 20 C14 20, 20 14, 20 4 Z" />
      <path d="M11 13 L17 7" stroke="var(--parchment)" strokeWidth={1.1} fill="none" opacity="0.55" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden
    >
      {/* Two stacked swells */}
      <path d="M2 9 Q6 5, 10 9 T18 9 Q20 9, 22 8" />
      <path d="M2 15 Q6 11, 10 15 T18 15 Q20 15, 22 14" />
    </svg>
  );
}

function FishIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      {/* Side-on fish: body, tail, eye */}
      <path d="M2 12 Q8 5, 15 8 Q18 9.5, 19 12 Q18 14.5, 15 16 Q8 19, 2 12 Z" />
      <path d="M19 12 L22.5 8.5 L22.5 15.5 Z" />
      <circle cx="7" cy="11" r="0.8" fill="currentColor" />
    </svg>
  );
}
