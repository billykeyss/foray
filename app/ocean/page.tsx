"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OCEAN_CATALOG } from "@/lib/ocean-catalog";
import type { OceanGroup, OceanSpecies } from "@/lib/ocean-types";
import { speciesInRegions } from "@/lib/weather";
import { useRegion } from "@/lib/region-context";
import GuideSegmented from "@/components/guide-segmented";
import { PNW_CATALOG } from "@/lib/species-catalog";
import { TREE_CATALOG } from "@/lib/tree-catalog";
import { EDIBLE_PLANTS } from "@/lib/plant-catalog";
import { OCEAN_GALLERY } from "@/lib/ocean-gallery";
import { localImage } from "@/lib/image-src";
import {
  oceanEdibilityChip,
  OceanEmoji,
  pickHero,
  GROUP_LABEL,
  TIDE_LABEL,
  MONTH_ABBR,
} from "@/components/ocean-shared";

const GROUP_FILTERS: { key: OceanGroup | "all" | "harvestable"; label: string }[] = [
  { key: "harvestable", label: "Harvestable" },
  { key: "all", label: "Incl. hazards" },
  { key: "kelp", label: "Kelp" },
  { key: "red-algae", label: "Red algae" },
  { key: "bivalve", label: "Bivalves" },
  { key: "crustacean", label: "Crustaceans" },
];

export default function OceanPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<OceanGroup | "all" | "harvestable">("harvestable");
  const [inSeasonOnly, setInSeasonOnly] = useState(false);
  const { filterTerms, def: regionDef } = useRegion();
  const month = new Date().getMonth() + 1;

  // Ocean foraging is inherently coastal. If the selected region is inland
  // (e.g. Tahoe / Great Basin) and matches no coastal species, ignore it rather
  // than showing an empty page — the region picker is really for the inland
  // mushroom/plant catalogs.
  const regionApplies = useMemo(
    () => OCEAN_CATALOG.some((o) => o.group !== "hazard" && speciesInRegions(o, filterTerms)),
    [filterTerms]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return OCEAN_CATALOG.filter((o) => {
      if (regionApplies && !speciesInRegions(o, filterTerms)) return false;
      if (filter === "harvestable" && o.group === "hazard") return false;
      else if (filter !== "all" && filter !== "harvestable" && o.group !== filter) return false;
      if (inSeasonOnly && !o.harvestMonths.includes(month)) return false;
      if (!needle) return true;
      const hay = [o.scientific, ...o.commonNames, o.habitat, GROUP_LABEL[o.group]]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [q, filter, inSeasonOnly, month, filterTerms, regionApplies]);

  const harvestable = filtered.filter((o) => o.group !== "hazard");
  const hazards = filtered.filter((o) => o.group === "hazard");

  return (
    <main className="relative z-10 px-6 pt-14 pb-6 lg:px-12 lg:pt-16 lg:max-w-[1280px]">
      <div className="running-head">
        <span className="chapter">Chapter VII · The Tide Line</span>
        <span className="center">Foray · Coastal Foraging · CA &amp; PNW</span>
        <span className="right">005</span>
      </div>

      <div className="eyebrow mb-3">Coastal foraging · California &amp; PNW coast</div>
      <h1 className="title-hero" style={{ fontSize: "clamp(34px, 7vw, 72px)" }}>
        Between the <em>tides.</em>
      </h1>
      <p
        className="font-body italic mt-2 mb-5"
        style={{ fontSize: 15, color: "var(--ink-soft)", maxWidth: 660 }}
      >
        Seaweeds and shellfish of the California and Pacific Northwest coast — what
        to gather, on which tides, and how to prepare it. The dominant danger here
        is invisible: red-tide biotoxins and shellfish quarantines.{" "}
        <strong>Always check the current state shellfish advisory before you harvest.</strong>
      </p>

      <GuideSegmented
        mushroomCount={PNW_CATALOG.length}
        treeCount={TREE_CATALOG.length}
        plantCount={EDIBLE_PLANTS.length}
        oceanCount={OCEAN_CATALOG.filter((o) => o.group !== "hazard").length}
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
          ? "Showing the whole coast"
          : regionApplies
            ? `Filtering to ${regionDef.label.toLowerCase()}`
            : `${regionDef.label} has no coastline — showing the whole California & PNW coast`}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, group, or habitat…"
        className="field-input mt-4"
      />

      <div className="flex flex-wrap gap-2 mt-4">
        {GROUP_FILTERS.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
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
        {harvestable.length} harvestable
        {hazards.length > 0 ? ` · ${hazards.length} biotoxin hazard${hazards.length === 1 ? "" : "s"}` : ""}
      </div>

      {harvestable.length > 0 && <OceanGrid species={harvestable} month={month} />}

      {hazards.length > 0 && (
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
            Biotoxin hazards{" "}
            <span className="font-mono not-italic" style={{ fontSize: 11, letterSpacing: "0.2em", opacity: 0.6 }}>
              ({hazards.length})
            </span>
          </h2>
          <p className="font-body italic mb-4" style={{ fontSize: 13.5, color: "var(--ink-soft)", maxWidth: 640 }}>
            Not food — the invisible poisons (PSP, domoic acid, DSP) and pathogens
            (Vibrio) that make shellfish unsafe. Cooking does not remove the
            biotoxins. Shellfish cards link here; read them before you harvest.
          </p>
          <OceanGrid species={hazards} month={month} />
        </section>
      )}

      {filtered.length === 0 && (
        <div
          className="font-mono text-center py-16"
          style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-soft)", opacity: 0.6 }}
        >
          No coastal species match — try widening the region or filters.
        </div>
      )}
    </main>
  );
}

function OceanGrid({ species, month }: { species: OceanSpecies[]; month: number }) {
  return (
    <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {species.map((o) => {
        const chip = oceanEdibilityChip(o.edibility);
        const inSeason = o.harvestMonths.includes(month);
        const isHazard = o.group === "hazard";
        const hero = pickHero(OCEAN_GALLERY[o.id]);
        return (
          <li key={o.id}>
            <Link
              href={`/ocean/${o.id}`}
              className="block card-paper relative overflow-hidden"
              style={{ padding: 0, textDecoration: "none", color: "inherit" }}
            >
              {hero ? (
                <img
                  src={localImage(hero.thumb ?? hero.url)}
                  alt={o.scientific}
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
                    background: isHazard
                      ? "linear-gradient(135deg, rgba(160,40,40,0.1), rgba(192,84,32,0.06))"
                      : "linear-gradient(135deg, rgba(46,68,82,0.1), rgba(63,82,56,0.06))",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 40,
                  }}
                >
                  <OceanEmoji species={o} />
                </div>
              )}
              <div style={{ padding: 16 }}>
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="font-display italic"
                    style={{
                      fontSize: 18,
                      fontWeight: 350,
                      color: isHazard ? "#a02828" : "var(--moss)",
                      lineHeight: 1.1,
                    }}
                  >
                    {o.commonNames[0]}
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
                  style={{ fontSize: 13, color: "var(--rust)", opacity: 0.85, marginTop: 2 }}
                >
                  {o.scientific}
                </div>
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
                  <span>{GROUP_LABEL[o.group]}</span>
                  {!isHazard && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      {inSeason ? (
                        <span style={{ color: "var(--moss-mid)" }}>● In season</span>
                      ) : (
                        <span>
                          {o.harvestMonths.length
                            ? `${MONTH_ABBR[o.harvestMonths[0] - 1]}–${MONTH_ABBR[o.harvestMonths[o.harvestMonths.length - 1] - 1]}`
                            : TIDE_LABEL[o.tidalZone]}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
