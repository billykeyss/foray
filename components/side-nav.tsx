"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocation } from "@/lib/location-context";
import RegionPicker from "@/components/region-picker";
import SettingsButton from "@/components/settings-button";

const tabs = [
  { href: "/", label: "Today" },
  { href: "/map", label: "Map" },
  { href: "/catalog", label: "Guide" },
  { href: "/trees", label: "Trees" },
  { href: "/plants", label: "Greens" },
  { href: "/charts", label: "Charts" },
  { href: "/journal", label: "Journal" },
];

export default function SideNav() {
  const pathname = usePathname();
  const { label, lat, lon } = useLocation();

  return (
    <aside
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[260px] z-40"
      style={{
        borderRight: "1px solid var(--line)",
        background: "rgba(240, 228, 200, 0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "32px 24px",
      }}
    >
      {/* wordmark */}
      <div className="flex items-center gap-3 mb-6">
        <Image
          src="/foray-icon.png"
          alt="Foray"
          width={40}
          height={40}
          priority
          style={{ width: 40, height: 40, objectFit: "contain" }}
        />
        <div>
          <div
            className="font-display"
            style={{
              fontSize: 22,
              fontWeight: 400,
              color: "var(--moss)",
              letterSpacing: "-0.02em",
              lineHeight: 0.9,
            }}
          >
            Foray
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: 8.5,
              letterSpacing: "0.24em",
              color: "var(--ink-soft)",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            Field book
          </div>
        </div>
      </div>

      <div className="mb-10">
        <RegionPicker variant="pill" />
      </div>

      <nav className="flex flex-col gap-1">
        {tabs.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex items-center justify-between group"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: active ? "var(--moss)" : "transparent",
                color: active ? "var(--parchment)" : "var(--moss)",
                transition: "background 0.15s ease",
              }}
            >
              <span
                className="font-display"
                style={{
                  fontSize: 19,
                  fontWeight: active ? 450 : 350,
                  fontStyle: active ? "italic" : "normal",
                  letterSpacing: "-0.01em",
                }}
              >
                {t.label}
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.2em",
                  opacity: active ? 0.7 : 0.4,
                }}
              >
                {String(tabs.indexOf(t) + 1).padStart(2, "0")}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* settings + current spot at bottom */}
      <div
        className="mt-auto"
        style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}
      >
        <SettingsButton variant="full" />
      </div>
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
        <div
          className="font-mono mb-2"
          style={{
            fontSize: 9,
            letterSpacing: "0.24em",
            color: "var(--ink-soft)",
            textTransform: "uppercase",
            opacity: 0.6,
          }}
        >
          Current spot
        </div>
        <div
          className="font-display italic"
          style={{
            fontSize: 18,
            fontWeight: 350,
            color: "var(--moss)",
            lineHeight: 1.1,
          }}
        >
          {label || "Untitled"}
        </div>
        <div
          className="font-mono mt-1"
          style={{
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "var(--ink-soft)",
          }}
        >
          {lat != null && lon != null
            ? `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`
            : "—"}
        </div>
        <Link
          href="/map"
          className="font-mono mt-3 inline-block"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--rust)",
            textDecoration: "none",
          }}
        >
          Change spot →
        </Link>
      </div>
    </aside>
  );
}
