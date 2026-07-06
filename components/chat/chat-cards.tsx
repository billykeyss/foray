"use client";

import Link from "next/link";
import type { ChatCard } from "@/lib/chat/store.ts";
import { safeHref } from "@/lib/chat/text.ts";
import { speciesRoute } from "@/lib/chat/species-route.ts";

const DANGER_COLORS: Record<string, string> = {
  deadly: "#8b1a1a",
  toxic: "#b4541e",
};

function edibilityBadge(edibility: string) {
  const danger = edibility === "deadly" || edibility === "toxic";
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hit.thumb} alt="" className="h-9 w-9 rounded object-cover" />
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
        <div key={s.name} className="flex items-center justify-between py-1 text-sm">
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

export default function ChatCardView({ card }: { card: ChatCard }) {
  switch (card.tool) {
    case "search_catalog":
      return <SearchCard data={card.data as Hit[]} />;
    case "get_species":
      return <SpeciesCard data={card.data as SpeciesCardData} />;
    case "get_weather":
      return <WeatherCard data={card.data as WeatherData} />;
    case "find_spots":
      return <SpotsCard data={card.data as Spot[]} />;
    case "web_search":
      return <WebCard data={card.data as { title: string; url: string }[]} />;
    default:
      return null; // unknown tools render nothing (forward-compatible, Keeper's pattern)
  }
}
