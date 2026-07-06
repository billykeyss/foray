"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Today", icon: MushIcon },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/catalog", label: "Guide", icon: BookIcon },
  { href: "/charts", label: "Charts", icon: ChartIcon },
  { href: "/journal", label: "Journal", icon: JournalIcon },
  { href: "/chat", label: "Ask", icon: AskIcon },
];

// /trees, /plants and /ocean live under the Guide tab — toggled via the in-page segmented control
const GUIDE_ROUTES = ["/catalog", "/trees", "/plants", "/ocean"];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[480px] border-t backdrop-blur-md lg:hidden"
      style={{
        background: "rgba(240, 228, 200, 0.92)",
        borderColor: "var(--line)",
        paddingBottom: "max(18px, env(safe-area-inset-bottom))",
        paddingTop: "10px",
      }}
    >
      <ul className="grid grid-cols-6 px-2">
        {tabs.map((t) => {
          const active =
            t.href === "/"
              ? pathname === "/"
              : t.href === "/catalog"
                ? GUIDE_ROUTES.some((r) => pathname.startsWith(r))
                : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex justify-center">
              <Link
                href={t.href}
                className="flex flex-col items-center gap-1.5 py-1 px-2"
                style={{ color: active ? "var(--rust)" : "var(--ink-soft)" }}
              >
                <Icon active={active} />
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    opacity: active ? 1 : 0.65,
                  }}
                >
                  {t.label}
                </span>
                <span
                  style={{
                    width: 14,
                    height: 1.5,
                    borderRadius: 2,
                    background: active ? "var(--rust)" : "transparent",
                  }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MushIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 80 100" aria-hidden>
      <path
        d="M10 35 Q10 12, 40 12 Q70 12, 70 35 Q70 42, 60 42 L20 42 Q10 42, 10 35 Z"
        fill="currentColor"
      />
      <circle cx="22" cy="22" r="3" fill="rgba(255,235,200,0.55)" />
      <circle cx="38" cy="18" r="2.2" fill="rgba(255,235,200,0.55)" />
      <circle cx="54" cy="24" r="2.8" fill="rgba(255,235,200,0.55)" />
      <path
        d="M30 42 L30 75 Q30 88, 40 88 Q50 88, 50 75 L50 42"
        fill={active ? "#e0a043" : "#a1958170"}
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.9"
      />
    </svg>
  );
}

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      aria-hidden
    >
      <path d="M9 4 L3 6 L3 20 L9 18 L15 20 L21 18 L21 4 L15 6 Z" />
      <path d="M9 4 L9 18 M15 6 L15 20" />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      aria-hidden
    >
      <path d="M3 12 L8 8 L13 14 L21 6" strokeLinecap="round" />
      <circle cx="3" cy="12" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="13" cy="14" r="1.4" fill="currentColor" />
      <circle cx="21" cy="6" r="1.4" fill="currentColor" />
    </svg>
  );
}

function BookIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path d="M4 4 L11 4 Q12 4 12 5 L12 20 Q12 19 11 19 L4 19 Z" />
      <path d="M20 4 L13 4 Q12 4 12 5 L12 20 Q12 19 13 19 L20 19 Z" />
    </svg>
  );
}

function TreeIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 1.6 : 1.5}
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Triangular conifer silhouette with a short trunk */}
      <path d="M12 3 L7 10 L9 10 L5.5 15 L8 15 L4 21 L20 21 L16 15 L18.5 15 L15 10 L17 10 Z" />
      <path
        d="M11 21 L11 23 L13 23 L13 21"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
      />
    </svg>
  );
}

function JournalIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path d="M5 4 L19 4 L19 21 L12 18 L5 21 Z" strokeLinejoin="round" />
    </svg>
  );
}

function AskIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      aria-hidden
    >
      <path d="M21 12a8 8 0 1 1-3.1-6.3L21 4l-1 3.4A8 8 0 0 1 21 12z" strokeLinejoin="round" />
      <circle cx="9" cy="12" r="0.8" fill="currentColor" />
      <circle cx="12.5" cy="12" r="0.8" fill="currentColor" />
      <circle cx="16" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}
