"use client";
import Link from "next/link";
import type { RankedItem } from "@/lib/forecast/types";
import type { PlantSpecies } from "@/lib/plant-types";
import { PlantEmoji, edibilityChip } from "@/components/plant-shared";

/** The plant forecaster's Today section. Sits beside — never through — the
 *  spore gauge: plants get a peak/in-season chip, no gauge, no "Day N after rain."
 *  Empty state is a frequent, real state (Sierra harvest runs ~May–Oct). */
export default function GreensInSeason({
  items,
  title,
  emptyState,
}: {
  items: RankedItem[];
  title: string;
  emptyState: string;
}) {
  return (
    <section className="mt-10 lg:mt-14">
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--moss-soft)",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <p className="font-body" style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          {emptyState}
        </p>
      ) : (
        <ul
          className="grid gap-2"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {items.map((it) => {
            const plant = it.item as PlantSpecies;
            const chip = edibilityChip(plant.edibility);
            const isPeak = it.label === "Peak now";
            return (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="flex items-center gap-3"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    textDecoration: "none",
                  }}
                >
                  <PlantEmoji plant={plant} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span
                      className="font-body block"
                      style={{
                        fontSize: 14,
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {plant.commonNames[0]}
                    </span>
                    <span className="font-mono block" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                      {it.note ?? it.label}
                    </span>
                  </span>
                  <span
                    className="font-mono flex-none"
                    style={{ fontSize: 10, fontWeight: 600, color: isPeak ? "var(--moss)" : "var(--ink-soft)" }}
                  >
                    {isPeak ? "PEAK" : "IN SEASON"}
                  </span>
                  <span className="font-mono flex-none" style={{ fontSize: 10, color: chip.color }}>
                    {chip.short}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
