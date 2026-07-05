"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Segmented control rendered at the top of the Guide pages (`/catalog`
 * and `/trees`). Lets the user pivot between the mushroom catalog and
 * the tree-partner catalog without going back to the tab bar.
 */
export default function GuideSegmented({
  mushroomCount,
  treeCount,
  plantCount,
}: {
  mushroomCount: number;
  treeCount: number;
  plantCount: number;
}) {
  const pathname = usePathname();
  const isMushrooms = pathname.startsWith("/catalog");
  const isTrees = pathname.startsWith("/trees");
  const isPlants = pathname.startsWith("/plants");

  return (
    <div
      className="font-mono mb-5"
      role="tablist"
      aria-label="Guide section"
      style={{
        display: "inline-flex",
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
  count: number;
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
      <span
        style={{
          opacity: active ? 0.7 : 0.5,
          fontSize: 9.5,
          letterSpacing: "0.1em",
        }}
      >
        {count}
      </span>
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
