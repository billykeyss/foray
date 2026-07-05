"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PNW_CATALOG } from "@/lib/species-catalog";
import type {
  Edibility,
  MushroomSpecies,
  TrophicMode,
} from "@/lib/species-types";
import { speciesInRegions } from "@/lib/weather";
import { useRegion } from "@/lib/region-context";
import SpeciesPhoto from "@/components/species-photo";
import GuideSegmented from "@/components/guide-segmented";
import { TREE_CATALOG } from "@/lib/tree-catalog";
import { EDIBLE_PLANTS } from "@/lib/plant-catalog";
import { HARVESTABLE_OCEAN } from "@/lib/ocean-catalog";

const EDIBILITY_FILTERS: { key: Edibility | "all"; label: string }[] = [
  { key: "all", label: "Any" },
  { key: "choice", label: "Choice" },
  { key: "edible", label: "Edible" },
  { key: "edible-when-cooked", label: "Cook first" },
  { key: "edible-with-caution", label: "Caution" },
];

const TROPHIC_FILTERS: { key: TrophicMode | "all"; label: string }[] = [
  { key: "all", label: "All trophic" },
  { key: "mycorrhizal", label: "Mycorrhizal" },
  { key: "saprotrophic", label: "Saprotroph" },
  { key: "parasitic", label: "Parasite" },
  { key: "mixed", label: "Mixed" },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function CatalogPage() {
  const [q, setQ] = useState("");
  const [edibility, setEdibility] = useState<Edibility | "all">("all");
  const [trophic, setTrophic] = useState<TrophicMode | "all">("all");
  const [inSeasonOnly, setInSeasonOnly] = useState(false);
  const { filterTerms, def: regionDef } = useRegion();

  const month = new Date().getMonth() + 1;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PNW_CATALOG.filter((s) => {
      if (!speciesInRegions(s, filterTerms)) return false;
      if (edibility !== "all" && s.edibility !== edibility) return false;
      if (trophic !== "all" && s.trophicMode !== trophic) return false;
      if (inSeasonOnly && !s.fruitingMonths.includes(month)) return false;
      if (!needle) return true;
      const hay = [
        s.scientific,
        ...s.commonNames,
        s.family,
        s.substrate,
        ...s.hostTrees.flatMap((h) => [h.common, h.scientific]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [q, edibility, trophic, inSeasonOnly, month, filterTerms]);

  return (
    <main className="relative z-10 px-6 pt-14 pb-6 lg:px-12 lg:pt-16 lg:max-w-[1280px] 2xl:max-w-none 2xl:px-16">
      <div className="running-head">
        <span className="chapter">Chapter V · The Library</span>
        <span className="center">Foray · The Atlas · {PNW_CATALOG.length} plates</span>
        <span className="right">002</span>
      </div>
      <div className="eyebrow mb-3">
        Knowledge log · {PNW_CATALOG.length} species
      </div>
      <h1
        className="title-hero"
        style={{ fontSize: "clamp(34px, 7vw, 96px)" }}
      >
        Pacific NW <em>field catalog.</em>
      </h1>
      <p
        className="font-body italic mt-2 mb-5"
        style={{ fontSize: 15, color: "var(--ink-soft)", maxWidth: 620 }}
      >
        {PNW_CATALOG.length} edible species researched against MykoWeb, PNW Key
        Council, peer-reviewed mycology, and IUCN. Tap any entry for full
        details.
      </p>
      <GuideSegmented
        mushroomCount={PNW_CATALOG.length}
        treeCount={TREE_CATALOG.length}
        plantCount={EDIBLE_PLANTS.length}
        oceanCount={HARVESTABLE_OCEAN.length}
      />

      <div
        className="font-mono mt-5"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          opacity: 0.6,
        }}
      >
        {regionDef.terms == null
          ? "Showing all regions"
          : `Filtering to ${regionDef.label.toLowerCase()}`}
      </div>

      {/* Filters */}
      <div className="mt-7 space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, host tree, family…"
          className="field-input"
        />

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {EDIBILITY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setEdibility(f.key)}
              className={`metric-tab${edibility === f.key ? " on" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {TROPHIC_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTrophic(f.key)}
              className={`metric-tab${trophic === f.key ? " on" : ""}`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => setInSeasonOnly((v) => !v)}
            className={`metric-tab${inSeasonOnly ? " on" : ""}`}
          >
            ☂ In season ({MONTHS[month - 1]})
          </button>
        </div>
      </div>

      <div
        className="font-mono mt-6 mb-3"
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        {filtered.length} match{filtered.length === 1 ? "" : "es"}
      </div>

      {filtered.length === 0 ? (
        <div
          className="card-paper text-center"
          style={{ padding: 32 }}
        >
          <div
            className="font-display italic"
            style={{
              fontSize: 19,
              color: "var(--moss)",
              marginBottom: 6,
            }}
          >
            No species match.
          </div>
          <p
            className="font-body"
            style={{ fontSize: 14, color: "var(--ink-soft)" }}
          >
            Loosen the filters and try again.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <li key={s.id}>
              <SpeciesListCard s={s} currentMonth={month} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function SpeciesListCard({
  s,
  currentMonth,
}: {
  s: MushroomSpecies;
  currentMonth: number;
}) {
  const inSeason = s.fruitingMonths.includes(currentMonth);
  return (
    <Link
      href={`/catalog/${s.id}`}
      className="block card-paper relative overflow-hidden"
      style={{
        padding: 0,
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <SpeciesPhoto
        speciesId={s.id}
        scientific={s.scientific}
        variant="thumb"
        className="rounded-b-none"
      />
      <div style={{ padding: 18 }}>
      <div className="flex justify-between items-start gap-3">
        <div
          className="font-display italic"
          style={{
            fontSize: 22,
            fontWeight: 350,
            color: "var(--moss)",
            lineHeight: 1.05,
          }}
        >
          {s.commonNames[0]}
        </div>
        <EdibilityBadge edibility={s.edibility} />
      </div>

      <div
        className="font-display italic mt-1"
        style={{
          fontSize: 14,
          fontWeight: 350,
          color: "var(--rust)",
          opacity: 0.85,
        }}
      >
        {s.scientific}
      </div>

      <div
        className="font-mono mt-2"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        {s.family} · {s.trophicMode}
      </div>

      {s.hostTrees.length > 0 && (
        <div
          className="font-body mt-3"
          style={{
            fontSize: 13,
            color: "var(--ink)",
            lineHeight: 1.4,
            opacity: 0.78,
          }}
        >
          {s.hostTrees
            .slice(0, 3)
            .map((h) => h.common)
            .join(", ")}
          {s.hostTrees.length > 3 && " · …"}
        </div>
      )}

      {/* Season strip */}
      <div className="flex gap-[2px] mt-4">
        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const isFruit = s.fruitingMonths.includes(m);
          const isPeak = s.peakMonths.includes(m);
          const isToday = m === currentMonth;
          return (
            <div
              key={m}
              title={`${MONTHS[i]}${isFruit ? " · fruits" : ""}${
                isPeak ? " · peak" : ""
              }`}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 2,
                background: isPeak
                  ? "var(--rust)"
                  : isFruit
                    ? "var(--moss-soft)"
                    : "rgba(26,20,16,0.07)",
                outline: isToday ? "1.5px solid var(--rust)" : "none",
                outlineOffset: 1,
              }}
            />
          );
        })}
      </div>

      {inSeason && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--moss-soft)",
            boxShadow: "0 0 0 3px rgba(240, 228, 200, 0.9)",
          }}
          title="Currently in season"
        />
      )}
      </div>
    </Link>
  );
}

function EdibilityBadge({ edibility }: { edibility: Edibility }) {
  const map: Record<Edibility, { label: string; color: string; bg: string }> = {
    choice: {
      label: "Choice",
      color: "var(--rust)",
      bg: "rgba(161, 74, 42, 0.1)",
    },
    edible: {
      label: "Edible",
      color: "var(--moss-mid)",
      bg: "rgba(63, 82, 56, 0.1)",
    },
    "edible-when-cooked": {
      label: "Cook",
      color: "var(--rain-deep)",
      bg: "rgba(46, 68, 82, 0.1)",
    },
    "edible-with-caution": {
      label: "Caution",
      color: "#a8742c",
      bg: "rgba(168, 116, 44, 0.1)",
    },
    inedible: {
      label: "Inedible",
      color: "#6b6b6b",
      bg: "rgba(107, 107, 107, 0.1)",
    },
    psychoactive: {
      label: "Psychoactive",
      color: "#7d4a8f",
      bg: "rgba(125, 74, 143, 0.1)",
    },
    "medicinal-only": {
      label: "Medicinal",
      color: "var(--moss-mid)",
      bg: "rgba(63, 82, 56, 0.1)",
    },
    toxic: {
      label: "Toxic",
      color: "#c05420",
      bg: "rgba(192, 84, 32, 0.12)",
    },
    deadly: {
      label: "Deadly",
      color: "#a02828",
      bg: "rgba(160, 40, 40, 0.12)",
    },
  };
  const m = map[edibility];
  return (
    <span
      className="font-mono"
      style={{
        flex: "none",
        fontSize: 9,
        letterSpacing: "0.18em",
        color: m.color,
        background: m.bg,
        padding: "4px 8px",
        borderRadius: 100,
        textTransform: "uppercase",
      }}
    >
      {m.label}
    </span>
  );
}
