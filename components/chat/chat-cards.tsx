"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import type { ChatCard } from "@/lib/chat/store.ts";
import { safeHref } from "@/lib/chat/text.ts";
import { speciesRoute } from "@/lib/chat/species-route.ts";
import DocLink from "@/components/doc-link";
import { useUnits } from "@/lib/units-context";
import { fmtElev, reasonText, unitSystemFor } from "@/lib/forage-find/format.ts";
import type { Reason } from "@/lib/forage-find/score.ts";

/** Persisted card data can outlive schema changes; one bad card must not
 * blank the whole chat. Class component because error boundaries can't be
 * function components. */
class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// deadly/toxic hexes match DangerBadge in components/lookalike-card.tsx.
const DANGER_COLORS: Record<string, string> = {
  deadly: "#a02828",
  toxic: "#c05420",
  psychoactive: "#7a4a9e",
};

function edibilityBadge(edibility: string) {
  const danger = edibility in DANGER_COLORS;
  return (
    <span
      className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
      style={{
        borderColor: danger ? DANGER_COLORS[edibility] : "var(--line)",
        color: danger ? DANGER_COLORS[edibility] : "var(--ink-soft)",
      }}
    >
      {edibility}
    </span>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "rgba(255,255,255,0.5)" }}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

interface Hit {
  id: string;
  kind: string;
  common: string;
  scientific: string;
  edibility: string;
  thumb: string | null;
}

// Route + label resolution is shared with the markdown chips —
// lib/chat/species-route.ts is the single source of truth (real
// /plants/[id] and /ocean/[id] routes, not list-page anchors).
function speciesHref(hit: { id: string }): string {
  return speciesRoute(hit.id)?.href ?? "/catalog";
}

function SpeciesRow({ hit }: { hit: Hit }) {
  return (
    <Link href={speciesHref(hit)} className="flex items-center gap-2 py-1.5">
      {hit.thumb ? (
        <img src={hit.thumb} alt="" loading="lazy" width={36} height={36} className="h-9 w-9 rounded object-cover" />
      ) : (
        <span className="h-9 w-9 rounded" style={{ background: "var(--line)" }} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{hit.common}</span>
        <span className="block truncate text-xs italic" style={{ color: "var(--ink-soft)" }}>
          {hit.scientific}
        </span>
      </span>
      {edibilityBadge(hit.edibility)}
    </Link>
  );
}

function SearchCard({ data }: { data: Hit[] }) {
  if (!data.length) return null;
  return (
    <Shell title="Catalog results">
      <div className="divide-y" style={{ borderColor: "var(--line)" }}>
        {data.slice(0, 8).map((h) => (
          <SpeciesRow key={h.id} hit={h} />
        ))}
      </div>
    </Shell>
  );
}

interface SpeciesCardData extends Hit {
  lookalikes: { name: string; danger: string; catalogId?: string | null }[];
}

function SpeciesCard({ data }: { data: SpeciesCardData }) {
  const dangerous = data.lookalikes.filter((l) => l.danger === "deadly" || l.danger === "toxic");
  return (
    <Shell title="Species">
      <SpeciesRow hit={data} />
      {dangerous.length > 0 && (
        <div className="mt-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: DANGER_COLORS.toxic }}>
          <span className="font-semibold">Dangerous lookalikes: </span>
          {dangerous.map((l, i) => {
            const route = l.catalogId ? speciesRoute(l.catalogId) : null;
            return (
              <span key={i}>
                {i > 0 && ", "}
                {route ? (
                  <Link href={route.href} className="underline">
                    {l.name}
                  </Link>
                ) : (
                  l.name
                )}{" "}
                ({l.danger})
              </span>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

interface WeatherData {
  label: string;
  reading: { score: number; label: string; rain7d: number; daysSinceRain: number; tempToday: number; humidityToday: number };
  outlook: { date: string; tempMaxC: number; tempMinC: number; rainMm: number }[];
}

function WeatherCard({ data }: { data: WeatherData }) {
  return (
    <Shell title={`Conditions · ${data.label}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{data.reading.score}</span>
        <span className="text-sm">{data.reading.label}</span>
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
        {data.reading.rain7d.toFixed(0)}mm rain / 7d · day {data.reading.daysSinceRain} since rain ·{" "}
        {data.reading.tempToday.toFixed(0)}°C · {data.reading.humidityToday.toFixed(0)}% RH
      </div>
    </Shell>
  );
}

interface Spot {
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  sporeScore: number;
}

function SpotsCard({ data }: { data: Spot[] }) {
  if (!data.length) return null;
  return (
    <Shell title="Nearby spots">
      {data.slice(0, 6).map((s) => (
        <div key={`${s.lat},${s.lon}`} className="flex items-center justify-between py-1 text-sm">
          <Link href="/map" className="truncate underline decoration-dotted">
            {s.name}
          </Link>
          <span className="ml-2 shrink-0 font-mono text-xs" style={{ color: "var(--ink-soft)" }}>
            {s.distanceKm}km · score {s.sporeScore}
          </span>
        </div>
      ))}
    </Shell>
  );
}

interface FindCardData {
  species: { id: string; name: string };
  status: "ok" | "poor" | "low-confidence" | "unavailable" | "out-of-season";
  message: string;
  radiusKm: number;
  spots: {
    rank: number;
    label: string;
    score: number;
    elevationM: number | null;
    why: string[];
    /** Raw good reasons (with values) for unit formatting; absent on older cards. */
    reasons?: Pick<Reason, "text" | "q">[];
  }[];
  inSeasonNow: { id: string; name: string }[];
  cautions: string[];
  mapLink: string;
}

function FindCard({ data }: { data: FindCardData }) {
  const { elevation } = useUnits();
  const u = unitSystemFor(elevation);
  const mapHref = `/?find=${encodeURIComponent(data.species.id)}`;
  return (
    <Shell title={`Find spots · ${data.species.name} · ${data.radiusKm} km`}>
      {data.status !== "ok" && (
        <p className="mb-2 text-sm" style={{ color: "var(--ink)" }}>
          {data.message}
        </p>
      )}
      {data.spots.slice(0, 5).map((s) => (
        <div key={s.rank} className="flex items-start gap-2 py-1.5 text-sm">
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold"
            style={{ background: "#e0a043", color: "#1a2b22" }}
            aria-hidden
          >
            {s.rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {s.label}
              {s.elevationM != null && (
                <span className="font-mono text-xs" style={{ color: "var(--ink-soft)" }}>
                  {" "}
                  · {fmtElev(s.elevationM, u)}
                </span>
              )}
            </span>
            {s.why.length > 0 && (
              <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
                {(s.reasons?.length ? s.reasons.map((r) => reasonText(r, u)) : s.why).slice(0, 4).join(" · ")}
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-xs" style={{ color: "var(--ink-soft)" }}>
            {s.score}
          </span>
        </div>
      ))}
      {(data.status === "poor" || data.status === "out-of-season") && data.inSeasonNow.length > 0 && (
        <div className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
          In season now: {data.inSeasonNow.map((s) => s.name).join(", ")}
        </div>
      )}
      {data.cautions.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs font-semibold" style={{ color: "var(--ink)" }}>
          {data.cautions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {data.spots.length > 0 && (
        <DocLink href={mapHref} className="mt-2 inline-block font-mono text-[11px] uppercase tracking-widest underline" style={{ color: "var(--rust)" }}>
          Show on map →
        </DocLink>
      )}
    </Shell>
  );
}

function WebCard({ data }: { data: { title: string; url: string }[] }) {
  const items = data.map((r) => ({ ...r, href: safeHref(r.url) })).filter((r) => r.href);
  if (!items.length) return null;
  return (
    <Shell title="From the web · not Foray-verified">
      {items.slice(0, 8).map((r, i) => (
        <a key={i} href={r.href!} target="_blank" rel="noopener noreferrer" className="block truncate py-1 text-sm underline">
          {r.title}
        </a>
      ))}
    </Shell>
  );
}

function CardBody({ card }: { card: ChatCard }) {
  switch (card.tool) {
    case "search_catalog":
      return <SearchCard data={card.data as Hit[]} />;
    case "get_species":
      return <SpeciesCard data={card.data as SpeciesCardData} />;
    case "get_weather":
      return <WeatherCard data={card.data as WeatherData} />;
    case "find_spots":
      return <SpotsCard data={card.data as Spot[]} />;
    case "find_forage_spots":
      return <FindCard data={card.data as FindCardData} />;
    case "web_search":
      return <WebCard data={card.data as { title: string; url: string }[]} />;
    default:
      return null; // unknown tools render nothing (forward-compatible, Keeper's pattern)
  }
}

export default function ChatCardView({ card }: { card: ChatCard }) {
  return (
    <CardBoundary>
      <CardBody card={card} />
    </CardBoundary>
  );
}
