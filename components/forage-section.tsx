"use client";
import Link from "next/link";
import type { RankedItem } from "@/lib/forecast/types";
import type { PlantSpecies } from "@/lib/plant-types";
import type { OceanSpecies } from "@/lib/ocean-types";
import { PlantEmoji, edibilityChip } from "@/components/plant-shared";
import { OceanEmoji, oceanEdibilityChip } from "@/components/ocean-shared";

/** One forecaster's Today section. Renders any kind of RankedItem uniformly —
 *  beside, never through, the mushroom spore gauge. Shellfish items foreground a
 *  biotoxin-safety line (`warn`); plants/mushrooms leave it undefined. */
export default function ForageSection({
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
        style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--moss-soft)", marginBottom: 12 }}
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
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", listStyle: "none", padding: 0, margin: 0 }}
        >
          {items.map((it) => (
            <ForageCard key={`${it.kind}-${it.id}`} it={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ForageCard({ it }: { it: RankedItem }) {
  const isPeak = /peak/i.test(it.label);
  const chip =
    it.kind === "shellfish"
      ? oceanEdibilityChip((it.item as OceanSpecies).edibility)
      : edibilityChip((it.item as PlantSpecies).edibility);
  const emoji =
    it.kind === "shellfish" ? (
      <OceanEmoji species={it.item as OceanSpecies} />
    ) : (
      <PlantEmoji plant={it.item as PlantSpecies} />
    );

  return (
    <li>
      <Link
        href={it.href}
        className="block"
        style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, textDecoration: "none" }}
      >
        <span className="flex items-center gap-3">
          {emoji}
          <span style={{ minWidth: 0, flex: 1 }}>
            <span
              className="font-body block"
              style={{ fontSize: 14, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {it.item.commonNames[0]}
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
        </span>
        {it.warn && (
          <span
            className="font-mono block"
            style={{ marginTop: 8, fontSize: 9.5, lineHeight: 1.5, color: "var(--rust)", letterSpacing: "0.02em" }}
          >
            {it.warn}
          </span>
        )}
      </Link>
    </li>
  );
}
