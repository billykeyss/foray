"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PLANT_CATALOG } from "@/lib/plant-catalog";
import type { PlantEdibility, PlantSpecies } from "@/lib/plant-types";
import { speciesInRegions } from "@/lib/weather";
import { useRegion } from "@/lib/region-context";
import GuideSegmented from "@/components/guide-segmented";
import { PNW_CATALOG } from "@/lib/species-catalog";
import { TREE_CATALOG } from "@/lib/tree-catalog";
import { HARVESTABLE_OCEAN } from "@/lib/ocean-catalog";
import { PLANT_GALLERY } from "@/lib/plant-gallery";
import { localImage } from "@/lib/image-src";
import {
  edibilityChip,
  PlantEmoji,
  pickHero,
  MONTH_ABBR,
} from "@/components/plant-shared";

const EDIBILITY_FILTERS: { key: PlantEdibility | "all" | "harvestable"; label: string }[] = [
  { key: "harvestable", label: "Edible only" },
  { key: "all", label: "Incl. warnings" },
  { key: "choice", label: "Choice" },
  { key: "edible-cooked", label: "Cook first" },
  { key: "edible-with-caution", label: "Caution" },
];

const WARNING: PlantEdibility[] = ["deadly", "toxic", "inedible"];

export default function PlantsPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PlantEdibility | "all" | "harvestable">(
    "harvestable"
  );
  const [inSeasonOnly, setInSeasonOnly] = useState(false);
  const { filterTerms, def: regionDef } = useRegion();
  const month = new Date().getMonth() + 1;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PLANT_CATALOG.filter((p) => {
      if (!speciesInRegions(p, filterTerms)) return false;
      if (filter === "harvestable" && WARNING.includes(p.edibility)) return false;
      else if (filter !== "all" && filter !== "harvestable" && p.edibility !== filter)
        return false;
      if (inSeasonOnly && !p.harvestMonths.includes(month)) return false;
      if (!needle) return true;
      const hay = [p.scientific, ...p.commonNames, p.family, p.habitat]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [q, filter, inSeasonOnly, month, filterTerms]);

  const edibles = filtered.filter((p) => !WARNING.includes(p.edibility));
  const warnings = filtered.filter((p) => WARNING.includes(p.edibility));

  return (
    <main className="relative z-10 px-6 pt-14 pb-6 lg:px-12 lg:pt-16 lg:max-w-[1280px]">
      <div className="running-head">
        <span className="chapter">Chapter VI · The Green Larder</span>
        <span className="center">Foray · Wild Greens · Tahoe–Truckee</span>
        <span className="right">004</span>
      </div>

      <div className="eyebrow mb-3">
        Wild edible plants · Sierra Nevada
      </div>
      <h1 className="title-hero" style={{ fontSize: "clamp(34px, 7vw, 72px)" }}>
        Greens of the <em>high country.</em>
      </h1>
      <p
        className="font-body italic mt-2 mb-5"
        style={{ fontSize: 15, color: "var(--ink-soft)", maxWidth: 640 }}
      >
        Wild edible plants of the Tahoe–Truckee Sierra — what to gather, when it
        is in season, how to prepare it, and the deadly lookalikes that share the
        same meadows. Auto-compiled from public botanical and poison-control
        sources; confirm every identification before you forage.
      </p>

      <GuideSegmented
        mushroomCount={PNW_CATALOG.length}
        treeCount={TREE_CATALOG.length}
        plantCount={PLANT_CATALOG.filter((p) => !WARNING.includes(p.edibility)).length}
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

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, family, or habitat…"
        className="field-input mt-4"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mt-4">
        {EDIBILITY_FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Chip>
        ))}
        <Chip active={inSeasonOnly} onClick={() => setInSeasonOnly((v) => !v)}>
          In season now
        </Chip>
      </div>

      <div
        className="font-mono mt-5 mb-3"
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        {edibles.length} edible{edibles.length === 1 ? "" : "s"}
        {warnings.length > 0 ? ` · ${warnings.length} warning entr${warnings.length === 1 ? "y" : "ies"}` : ""}
      </div>

      {edibles.length > 0 && (
        <PlantGrid plants={edibles} month={month} />
      )}

      {warnings.length > 0 && (
        <section className="mt-12">
          <h2
            className="font-display italic"
            style={{
              fontSize: 26,
              fontWeight: 350,
              color: "#a02828",
              letterSpacing: "-0.01em",
              marginBottom: 6,
              paddingBottom: 8,
              borderBottom: "1px solid rgba(160,40,40,0.3)",
            }}
          >
            Deadly &amp; toxic lookalikes{" "}
            <span
              className="font-mono not-italic"
              style={{ fontSize: 11, letterSpacing: "0.2em", opacity: 0.6 }}
            >
              ({warnings.length})
            </span>
          </h2>
          <p
            className="font-body italic mb-4"
            style={{ fontSize: 13.5, color: "var(--ink-soft)", maxWidth: 620 }}
          >
            Not food. Catalogued so an edible&rsquo;s lookalike links here — learn
            these first; several grow in the same meadows as the plants above.
          </p>
          <PlantGrid plants={warnings} month={month} />
        </section>
      )}

      {filtered.length === 0 && (
        <div
          className="font-mono text-center py-16"
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            opacity: 0.6,
          }}
        >
          No plants match — try widening the region or filters.
        </div>
      )}
    </main>
  );
}

function PlantGrid({
  plants,
  month,
}: {
  plants: PlantSpecies[];
  month: number;
}) {
  return (
    <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {plants.map((p) => {
        const chip = edibilityChip(p.edibility);
        const inSeason = p.harvestMonths.includes(month);
        const isWarning = WARNING.includes(p.edibility);
        const hero = pickHero(PLANT_GALLERY[p.id]);
        return (
          <li key={p.id}>
            <Link
              href={`/plants/${p.id}`}
              className="block card-paper relative overflow-hidden"
              style={{ padding: 0, textDecoration: "none", color: "inherit" }}
            >
              {hero ? (
                <img
                  src={localImage(hero.thumb ?? hero.url)}
                  alt={p.scientific}
                  loading="lazy"
                  style={{
                    width: "100%",
                    aspectRatio: "4 / 3",
                    objectFit: "cover",
                    borderRadius: "14px 14px 0 0",
                    background: "rgba(26,20,16,0.06)",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4 / 3",
                    borderRadius: "14px 14px 0 0",
                    background: isWarning
                      ? "linear-gradient(135deg, rgba(160,40,40,0.1), rgba(192,84,32,0.06))"
                      : "linear-gradient(135deg, rgba(44,58,42,0.09), rgba(107,125,93,0.06))",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 40,
                  }}
                >
                  <PlantEmoji plant={p} />
                </div>
              )}
              <div style={{ padding: 16 }}>
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="font-display italic"
                    style={{
                      fontSize: 18,
                      fontWeight: 350,
                      color: isWarning ? "#a02828" : "var(--moss)",
                      lineHeight: 1.1,
                    }}
                  >
                    {p.commonNames[0]}
                  </div>
                  <span
                    className="font-mono flex-none"
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.14em",
                      color: "var(--parchment)",
                      background: chip.color,
                      padding: "3px 7px",
                      borderRadius: 100,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      marginTop: 2,
                    }}
                  >
                    {chip.short}
                  </span>
                </div>
                <div
                  className="font-display italic"
                  style={{
                    fontSize: 13,
                    color: "var(--rust)",
                    opacity: 0.85,
                    marginTop: 2,
                  }}
                >
                  {p.scientific}
                </div>
                {!isWarning && (
                  <div
                    className="font-mono mt-3 flex items-center gap-2"
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      color: "var(--ink-soft)",
                      textTransform: "uppercase",
                      opacity: 0.75,
                    }}
                  >
                    {inSeason ? (
                      <span style={{ color: "var(--moss-mid)" }}>● In season</span>
                    ) : (
                      <span>
                        {p.harvestMonths.length
                          ? `${MONTH_ABBR[p.harvestMonths[0] - 1]}–${MONTH_ABBR[p.harvestMonths[p.harvestMonths.length - 1] - 1]}`
                          : "—"}
                      </span>
                    )}
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{p.edibleParts.slice(0, 2).join(", ")}</span>
                  </div>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="font-mono"
      style={{
        fontSize: 9.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        padding: "7px 13px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--moss)" : "var(--line)"}`,
        background: active ? "var(--moss)" : "transparent",
        color: active ? "var(--parchment)" : "var(--ink-soft)",
        cursor: "pointer",
        transition: "background 140ms ease, color 140ms ease",
      }}
    >
      {children}
    </button>
  );
}
