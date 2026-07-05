"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TREE_CATALOG } from "@/lib/tree-catalog";
import { localImage } from "@/lib/image-src";
import GuideSegmented from "@/components/guide-segmented";
import { PNW_CATALOG } from "@/lib/species-catalog";
import { EDIBLE_PLANTS } from "@/lib/plant-catalog";
import { HARVESTABLE_OCEAN } from "@/lib/ocean-catalog";

export default function TreesPage() {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TREE_CATALOG.filter((t) => {
      if (!needle) return true;
      return (
        t.common.toLowerCase().includes(needle) ||
        t.scientific.toLowerCase().includes(needle) ||
        (t.description?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [q]);

  // Group by genus (first word of scientific name) for cleaner browsing
  const grouped = useMemo(() => {
    const g = new Map<string, typeof TREE_CATALOG>();
    for (const t of filtered) {
      const genus = t.scientific.split(/\s/)[0];
      if (!g.has(genus)) g.set(genus, []);
      g.get(genus)!.push(t);
    }
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <main className="relative z-10 px-6 pt-14 pb-6 lg:px-12 lg:pt-16 lg:max-w-[1280px]">
      <div className="eyebrow mb-3">
        Tree partners · {TREE_CATALOG.length} species
      </div>
      <h1 className="title-hero" style={{ fontSize: "clamp(34px, 7vw, 72px)" }}>
        Trees of the <em>understory.</em>
      </h1>
      <p
        className="font-body italic mt-2 mb-5"
        style={{ fontSize: 15, color: "var(--ink-soft)", maxWidth: 640 }}
      >
        Every host tree referenced across the mushroom catalog. Find what grows
        where, then trace which mushrooms it supports.
      </p>
      <GuideSegmented
        mushroomCount={PNW_CATALOG.length}
        treeCount={TREE_CATALOG.length}
        plantCount={EDIBLE_PLANTS.length}
        oceanCount={HARVESTABLE_OCEAN.length}
      />

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by common or scientific name…"
        className="field-input mt-7"
      />

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
        {filtered.length} tree{filtered.length === 1 ? "" : "s"} ·{" "}
        {grouped.length} genera
      </div>

      <div className="space-y-10">
        {grouped.map(([genus, trees]) => (
          <section key={genus}>
            <h2
              className="font-display italic"
              style={{
                fontSize: 28,
                fontWeight: 350,
                color: "var(--moss)",
                letterSpacing: "-0.01em",
                marginBottom: 14,
                paddingBottom: 8,
                borderBottom: "1px solid var(--line)",
              }}
            >
              {genus}{" "}
              <span
                className="font-mono not-italic"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.2em",
                  color: "var(--ink-soft)",
                  opacity: 0.6,
                }}
              >
                ({trees.length})
              </span>
            </h2>
            <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {trees.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/trees/${t.id}`}
                    className="block card-paper relative overflow-hidden"
                    style={{
                      padding: 0,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    {t.image ? (
                      <img
                        src={localImage(t.image.thumb ?? t.image.url)}
                        alt={t.scientific}
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
                          background:
                            "linear-gradient(135deg, rgba(44,58,42,0.08), rgba(161,74,42,0.06))",
                          display: "grid",
                          placeItems: "center",
                          color: "var(--ink-soft)",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 10,
                          letterSpacing: "0.2em",
                          textTransform: "uppercase",
                          opacity: 0.5,
                        }}
                      >
                        🌲
                      </div>
                    )}
                    <div style={{ padding: 16 }}>
                      <div
                        className="font-display italic"
                        style={{
                          fontSize: 18,
                          fontWeight: 350,
                          color: "var(--moss)",
                          lineHeight: 1.1,
                        }}
                      >
                        {t.common}
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
                        {t.scientific}
                      </div>
                      <div
                        className="font-mono mt-3"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.18em",
                          color: "var(--ink-soft)",
                          textTransform: "uppercase",
                          opacity: 0.7,
                        }}
                      >
                        Hosts {t.speciesRefs.length} mushroom
                        {t.speciesRefs.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
