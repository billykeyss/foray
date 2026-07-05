import Link from "next/link";
import { notFound } from "next/navigation";
import { PLANT_CATALOG } from "@/lib/plant-catalog";
import type { PlantLookalike, PlantSpecies } from "@/lib/plant-types";
import type { Danger } from "@/lib/species-types";
import {
  edibilityMeta,
  MONTH_ABBR,
  PlantEmoji,
} from "@/components/plant-shared";

export function generateStaticParams() {
  return PLANT_CATALOG.map((p) => ({ id: p.id }));
}

/** genus+species (lowercased) → catalog id, for resolving lookalike deep-links. */
const BY_BINOMIAL = new Map<string, string>();
for (const p of PLANT_CATALOG) {
  BY_BINOMIAL.set(binomial(p.scientific), p.id);
}

function binomial(scientific: string): string {
  return scientific
    .toLowerCase()
    .split(/[\s(]+/)
    .slice(0, 2)
    .join(" ")
    .trim();
}

/** Resolve a lookalike to a catalogued plant/warning page when we have one. */
function resolveLookalike(l: PlantLookalike): string | undefined {
  if (l.catalogId) return l.catalogId;
  const b = binomial(l.scientific);
  // genus-only references ("Allium spp.") are too ambiguous to link
  if (!b || b.endsWith(" spp.") || b.split(" ").length < 2) return undefined;
  return BY_BINOMIAL.get(b);
}

const WARNING = new Set(["deadly", "toxic", "inedible"]);

export default async function PlantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = PLANT_CATALOG.find((x) => x.id === id);
  if (!p) notFound();

  const isWarning = WARNING.has(p.edibility);
  const month = new Date().getMonth() + 1;

  return (
    <main className="relative z-10 px-6 pt-14 pb-6 lg:px-12 lg:pt-16 lg:max-w-[1280px] 2xl:max-w-none 2xl:px-16">
      <div className="running-head">
        <span className="chapter">Chapter VI · The Green Larder</span>
        <span className="center">{p.family} · {p.commonNames[0]}</span>
        <span className="right">004</span>
      </div>

      <Link
        href="/plants"
        className="font-mono inline-flex items-center gap-2"
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--rust)",
          textDecoration: "none",
        }}
      >
        ← Greens
      </Link>

      <header className="mt-5">
        <div className="eyebrow mb-3">
          {p.family} · {p.habit} · {p.lifeCycle}
        </div>
        <h1 className="title-hero" style={{ fontSize: "clamp(34px, 6vw, 96px)" }}>
          {p.commonNames[0]}
        </h1>
        <div
          className="font-display italic mt-2"
          style={{
            fontSize: 22,
            fontWeight: 350,
            color: "var(--rust)",
            letterSpacing: "-0.01em",
          }}
        >
          {p.scientific}
        </div>
        {p.commonNames.length > 1 && (
          <div
            className="font-body italic mt-2"
            style={{ fontSize: 14, color: "var(--ink-soft)" }}
          >
            Also: {p.commonNames.slice(1).join(", ")}
          </div>
        )}
      </header>

      {p.autoCompiled && (
        <div
          className="font-mono mt-5"
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            letterSpacing: "0.02em",
            color: "var(--rust)",
            background: "rgba(189,122,18,0.07)",
            border: "1px solid rgba(189,122,18,0.3)",
            borderLeft: "3px solid var(--rust)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          Auto-compiled from public botanical and poison-control sources
          (Calflora · USDA · wildflower.org). Wild greens have deadly lookalikes —
          confirm every identification against a regional guide, and never eat a
          plant on the strength of one source.
        </div>
      )}

      <div className="mt-7">
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 7",
            borderRadius: 16,
            background: isWarning
              ? "linear-gradient(135deg, rgba(160,40,40,0.12), rgba(192,84,32,0.07))"
              : "linear-gradient(135deg, rgba(44,58,42,0.1), rgba(107,125,93,0.07))",
            display: "grid",
            placeItems: "center",
            fontSize: 72,
          }}
        >
          <PlantEmoji plant={p} />
        </div>
      </div>

      {!isWarning && p.harvestMonths.length > 0 && (
        <SeasonStrip
          harvest={p.harvestMonths}
          peak={p.peakMonths}
          currentMonth={month}
          note={p.seasonCue.notes}
        />
      )}

      <div className="lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-12 mt-10">
        {/* Left column */}
        <div className="space-y-8">
          <EdibilityBlock plant={p} />

          {p.cautions && (
            <CautionCallout text={p.cautions} deadly={isWarning} />
          )}

          {!isWarning && (
            <Section title="Preparation">
              <p
                className="font-body"
                style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--ink)" }}
              >
                {p.preparation}
              </p>
            </Section>
          )}

          <Section title="Identification">
            {p.identification.keyFeatures.length > 0 && (
              <ul
                className="flex flex-wrap gap-1.5 mb-4"
                style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}
              >
                {p.identification.keyFeatures.map((f) => (
                  <li
                    key={f}
                    className="font-mono"
                    style={{
                      fontSize: 10,
                      lineHeight: 1.3,
                      letterSpacing: "0.02em",
                      color: "var(--ink)",
                      background: "rgba(26,20,16,0.05)",
                      border: "1px solid var(--line)",
                      borderRadius: 100,
                      padding: "3px 9px",
                    }}
                  >
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <KVRow label="Leaves" value={p.identification.leaves} />
            <KVRow label="Stem" value={p.identification.stem} />
            <KVRow label="Flowers" value={p.identification.flowers} />
            {p.identification.fruit && (
              <KVRow label="Fruit" value={p.identification.fruit} />
            )}
            {p.identification.root && (
              <KVRow label="Root" value={p.identification.root} />
            )}
            {p.identification.aroma && (
              <KVRow label="Aroma" value={p.identification.aroma} />
            )}
            {p.identification.height && (
              <KVRow label="Height" value={p.identification.height} />
            )}
          </Section>

          <Section title="Habitat">
            <p
              className="font-body"
              style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink)" }}
            >
              {p.habitat}
            </p>
            {p.elevationM && (
              <KVRow
                label="Elevation"
                value={`${p.elevationM.min.toLocaleString()}–${p.elevationM.max.toLocaleString()} m`}
              />
            )}
            {p.regionsPNW.length > 0 && (
              <KVRow label="Regions" value={p.regionsPNW.join(" · ")} />
            )}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-8 mt-8 lg:mt-0">
          {!isWarning && (
            <Section title="What to gather">
              <KVRow label="Edible parts" value={p.edibleParts.join(", ")} />
              <KVRow
                label="Harvest"
                value={
                  p.harvestMonths.length
                    ? p.harvestMonths.map((m) => MONTH_ABBR[m - 1]).join(" · ")
                    : "—"
                }
              />
              {p.seasonCue.notes && (
                <p
                  className="font-body italic mt-3"
                  style={{
                    fontSize: 13,
                    color: "var(--ink-soft)",
                    lineHeight: 1.5,
                  }}
                >
                  {p.seasonCue.notes}
                </p>
              )}
            </Section>
          )}

          {p.lookalikes.length > 0 && (
            <Section title={`Lookalikes (${p.lookalikes.length})`}>
              <ul className="space-y-3 mt-2">
                {p.lookalikes.map((l) => (
                  <li key={`${l.scientific}·${l.name}`}>
                    <LookalikeCard lookalike={l} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!isWarning && (
            <Section title="Culinary">
              <KVRow label="Flavor" value={p.culinary.flavor} />
              <KVRow label="Uses" value={p.culinary.uses} />
              {p.culinary.preservation && (
                <KVRow label="Preservation" value={p.culinary.preservation} />
              )}
            </Section>
          )}

          {p.conservationNotes && (
            <Section title="Conservation">
              <p
                className="font-body"
                style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink)" }}
              >
                {p.conservationNotes}
              </p>
            </Section>
          )}

          <Section title={`Sources (${p.sources.length})`}>
            <ul className="space-y-1.5 mt-1">
              {p.sources.map((src, i) => (
                <li key={`${src.url}·${i}`}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body"
                    style={{
                      fontSize: 13.5,
                      color: "var(--rust)",
                      textDecoration: "underline",
                      textDecorationStyle: "dotted",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {src.name} ↗
                  </a>
                </li>
              ))}
            </ul>
            {p.verification && (
              <p
                className="font-mono mt-3"
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.1em",
                  color: "var(--ink-soft)",
                  opacity: 0.7,
                  textTransform: "uppercase",
                }}
              >
                {p.verification.sourcesAgreeing} sources ·{" "}
                {p.verification.consensus} consensus · verified{" "}
                {p.verification.lastVerified}
              </p>
            )}
          </Section>
        </div>
      </div>
    </main>
  );
}

/* ─────────── pieces ─────────── */

function LookalikeCard({ lookalike: l }: { lookalike: PlantLookalike }) {
  const linkId = resolveLookalike(l);
  const body = (
    <>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div
            className="font-display italic"
            style={{ fontSize: 17, color: "var(--moss)", lineHeight: 1.1 }}
          >
            {l.name}
          </div>
          <div
            className="font-display italic mt-0.5"
            style={{ fontSize: 13, color: "var(--rust)", opacity: 0.85 }}
          >
            {l.scientific}
          </div>
        </div>
        <DangerBadge danger={l.danger} />
      </div>
      {l.keyFeatures && l.keyFeatures.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5"
          style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}
        >
          {l.keyFeatures.map((f) => (
            <li
              key={f}
              className="font-mono"
              style={{
                fontSize: 9.5,
                lineHeight: 1.3,
                letterSpacing: "0.02em",
                color: "var(--ink)",
                background: "rgba(26,20,16,0.05)",
                border: "1px solid var(--line)",
                borderRadius: 100,
                padding: "2.5px 8px",
              }}
            >
              {f}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end justify-between gap-3">
        <p
          className="font-body mt-2"
          style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)" }}
        >
          {l.distinguishingFeature}
        </p>
        {linkId && (
          <span
            aria-hidden
            className="font-mono flex-none"
            style={{
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "var(--rust)",
              opacity: 0.6,
              textTransform: "uppercase",
              paddingBottom: 2,
            }}
          >
            ID →
          </span>
        )}
      </div>
    </>
  );

  const style: React.CSSProperties = {
    display: "block",
    padding: 14,
    borderRadius: 12,
    background: dangerBg(l.danger),
    border: `1px solid ${dangerBorder(l.danger)}`,
  };

  if (linkId) {
    return (
      <Link href={`/plants/${linkId}`} style={{ ...style, textDecoration: "none", color: "inherit" }}>
        {body}
      </Link>
    );
  }
  return <div style={style}>{body}</div>;
}

function DangerBadge({ danger }: { danger: Danger }) {
  const colors: Record<Danger, string> = {
    deadly: "#a02828",
    toxic: "#c05420",
    "GI-upset": "#a8742c",
    inedible: "#6b6b6b",
    edible: "var(--moss-mid)",
    "edible-when-cooked": "var(--rain-deep)",
    "edible-with-caution": "#a8742c",
  };
  return (
    <span
      className="font-mono"
      style={{
        flex: "none",
        fontSize: 9,
        letterSpacing: "0.2em",
        color: "var(--parchment)",
        background: colors[danger],
        padding: "4px 9px",
        borderRadius: 100,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {danger}
    </span>
  );
}

function dangerBg(d: Danger): string {
  switch (d) {
    case "deadly": return "rgba(160, 40, 40, 0.08)";
    case "toxic": return "rgba(192, 84, 32, 0.07)";
    case "GI-upset": return "rgba(168, 116, 44, 0.07)";
    default: return "rgba(255, 255, 255, 0.22)";
  }
}

function dangerBorder(d: Danger): string {
  switch (d) {
    case "deadly": return "rgba(160, 40, 40, 0.4)";
    case "toxic": return "rgba(192, 84, 32, 0.32)";
    case "GI-upset": return "rgba(168, 116, 44, 0.32)";
    default: return "var(--line)";
  }
}

function CautionCallout({ text, deadly }: { text: string; deadly: boolean }) {
  const fg = deadly ? "#a02828" : "#a8742c";
  return (
    <section
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: deadly ? "rgba(160,40,40,0.07)" : "rgba(168,116,44,0.08)",
        border: `1px solid ${fg}44`,
        borderLeft: `3px solid ${fg}`,
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          color: fg,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        ⚠ {deadly ? "Hazard" : "Caution"}
      </div>
      <p
        className="font-body"
        style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }}
      >
        {text}
      </p>
    </section>
  );
}

function EdibilityBlock({ plant }: { plant: PlantSpecies }) {
  const m = edibilityMeta(plant.edibility);
  return (
    <section
      style={{
        padding: 20,
        borderRadius: 14,
        background: m.bg,
        border: `1px solid ${m.color}33`,
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.28em",
          color: m.color,
          textTransform: "uppercase",
        }}
      >
        Edibility
      </div>
      <div
        className="font-display italic mt-2"
        style={{ fontSize: 22, fontWeight: 350, color: m.color, letterSpacing: "-0.01em" }}
      >
        {m.label}
      </div>
      <p
        className="font-body mt-1"
        style={{ fontSize: 14, color: "var(--ink)", opacity: 0.8, lineHeight: 1.5 }}
      >
        {m.sub}
      </p>
      {plant.toxicityNotes && (
        <p
          className="font-body italic mt-3"
          style={{
            fontSize: 13.5,
            color: "var(--ink)",
            lineHeight: 1.5,
            borderTop: "1px solid var(--line)",
            paddingTop: 12,
          }}
        >
          {plant.toxicityNotes}
        </p>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div
        className="font-mono mb-3"
        style={{
          fontSize: 10,
          letterSpacing: "0.28em",
          color: "var(--rust)",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="grid grid-cols-[110px_1fr] gap-3 py-2"
      style={{ borderBottom: "1px solid var(--line-soft)" }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          opacity: 0.7,
          paddingTop: 2,
        }}
      >
        {label}
      </div>
      <div
        className="font-body"
        style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SeasonStrip({
  harvest,
  peak,
  currentMonth,
  note,
}: {
  harvest: number[];
  peak: number[];
  currentMonth: number;
  note: string | null;
}) {
  return (
    <div className="mt-8">
      <div
        className="font-mono mb-2"
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        Harvest season
      </div>
      <div className="grid grid-cols-12 gap-[3px]">
        {MONTH_ABBR.map((m, i) => {
          const month = i + 1;
          const isHarvest = harvest.includes(month);
          const isPeak = peak.includes(month);
          const isToday = month === currentMonth;
          return (
            <div
              key={m}
              className="text-center"
              style={{
                padding: "10px 2px 6px",
                borderRadius: 8,
                background: isPeak
                  ? "var(--rust)"
                  : isHarvest
                    ? "rgba(107, 125, 93, 0.55)"
                    : "rgba(26, 20, 16, 0.05)",
                color: isPeak || isHarvest ? "var(--parchment)" : "var(--ink-soft)",
                outline: isToday ? "1.5px solid var(--rust)" : "none",
                outlineOffset: 2,
              }}
            >
              <div
                className="font-mono"
                style={{ fontSize: 9, letterSpacing: "0.14em", opacity: 0.85 }}
              >
                {m.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="flex gap-4 mt-3 font-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        <Legend swatch="var(--rust)" label="Peak" />
        <Legend swatch="rgba(107, 125, 93, 0.55)" label="Harvestable" />
      </div>
      {note && (
        <p
          className="font-body italic mt-3"
          style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5, maxWidth: 620 }}
        >
          {note}
        </p>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        style={{ width: 10, height: 10, borderRadius: 3, background: swatch, display: "inline-block" }}
      />
      {label}
    </span>
  );
}
