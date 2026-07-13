"use client";
import Link from "next/link";
import type { RankedItem } from "@/lib/forecast/types";
import type { PlantSpecies } from "@/lib/plant-types";
import type { OceanSpecies } from "@/lib/ocean-types";
import {
  PlantEmoji,
  edibilityChip,
  pickHero as pickPlantHero,
} from "@/components/plant-shared";
import {
  OceanEmoji,
  oceanEdibilityChip,
  pickHero as pickOceanHero,
} from "@/components/ocean-shared";
import { PLANT_GALLERY } from "@/lib/plant-gallery";
import { OCEAN_GALLERY } from "@/lib/ocean-gallery";
import { localImage } from "@/lib/image-src.ts";

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
  const hero =
    it.kind === "shellfish"
      ? pickOceanHero(OCEAN_GALLERY[it.id])
      : pickPlantHero(PLANT_GALLERY[it.id]);

  const thumb = hero ? (
    <img
      src={localImage(hero.thumb ?? hero.url)}
      alt={it.item.commonNames[0]}
      loading="lazy"
      style={{
        width: 40,
        height: 40,
        flex: "none",
        borderRadius: 8,
        objectFit: "cover",
        background: "rgba(26, 20, 16, 0.06)",
      }}
    />
  ) : (
    <span
      aria-hidden
      style={{
        width: 40,
        height: 40,
        flex: "none",
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        fontSize: 20,
        background: "rgba(63, 82, 56, 0.08)",
      }}
    >
      {it.kind === "shellfish" ? (
        <OceanEmoji species={it.item as OceanSpecies} />
      ) : (
        <PlantEmoji plant={it.item as PlantSpecies} />
      )}
    </span>
  );

  return (
    <li>
      <Link
        href={it.href}
        className="block"
        style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, textDecoration: "none" }}
      >
        <span className="flex items-center gap-3">
          {thumb}
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
