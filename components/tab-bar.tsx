"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Map", icon: MapIcon },
  { href: "/catalog", label: "Guide", icon: BookIcon },
  { href: "/journal", label: "Journal", icon: JournalIcon },
  { href: "/chat", label: "Ask", icon: AskIcon },
];

// /trees, /plants and /ocean live under the Guide tab — toggled via the in-page segmented control
const GUIDE_ROUTES = ["/catalog", "/trees", "/plants", "/ocean", "/fish"];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[480px] border-t backdrop-blur-md lg:hidden"
      style={{
        background: "color-mix(in srgb, var(--kp-bone) 94%, transparent)",
        borderColor: "rgba(26, 43, 34, 0.14)",
        paddingBottom: "max(18px, env(safe-area-inset-bottom))",
        paddingTop: "10px",
      }}
    >
      <ul className="grid grid-cols-4 px-2">
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
                style={{ color: active ? "var(--kp-ink)" : "rgba(26, 43, 34, 0.55)" }}
              >
                <Icon active={active} />
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    opacity: active ? 1 : 0.8,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {t.label}
                </span>
                <span
                  style={{
                    width: 14,
                    height: 1.5,
                    borderRadius: 2,
                    background: active ? "var(--kp-amber)" : "transparent",
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
