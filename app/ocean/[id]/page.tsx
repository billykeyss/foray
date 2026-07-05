import Link from "next/link";
import { notFound } from "next/navigation";
import { OCEAN_CATALOG } from "@/lib/ocean-catalog";
import type { OceanLookalike, OceanSpecies } from "@/lib/ocean-types";
import type { Danger } from "@/lib/species-types";
import { OCEAN_GALLERY } from "@/lib/ocean-gallery";
import { localImage } from "@/lib/image-src";
import PhotoGallery from "@/components/photo-gallery";
import {
  oceanEdibilityMeta,
  MONTH_ABBR,
  OceanEmoji,
  pickHero,
  OCEAN_KIND_LABEL,
  GROUP_LABEL,
  TIDE_LABEL,
} from "@/components/ocean-shared";

export function generateStaticParams() {
  return OCEAN_CATALOG.map((o) => ({ id: o.id }));
}

const BY_BINOMIAL = new Map<string, string>();
for (const o of OCEAN_CATALOG) BY_BINOMIAL.set(binomial(o.scientific), o.id);

function binomial(scientific: string): string {
  return scientific.toLowerCase().split(/[\s(/—-]+/).slice(0, 2).join(" ").trim();
}

function resolveLookalike(l: OceanLookalike): string | undefined {
  if (l.catalogId) return l.catalogId;
  const b = binomial(l.scientific);
  if (!b || b.endsWith(" spp.") || b.split(" ").length < 2) return undefined;
  return BY_BINOMIAL.get(b);
}

/** Which biotoxin/pathogen hazard pages a species' biotoxinNotes references. */
const HAZARD_MATCHERS: { id: string; label: string; re: RegExp }[] = [
  { id: "paralytic-shellfish-poisoning", label: "PSP / red tide", re: /\bPSP\b|paralytic|saxitoxin|alexandrium/i },
  { id: "amnesic-shellfish-poisoning", label: "Domoic acid", re: /domoic|\bASP\b|amnesic|pseudo-nitzschia/i },
  { id: "diarrhetic-shellfish-poisoning", label: "DSP", re: /\bDSP\b|diarrhetic|okadaic|dinophysis/i },
  { id: "vibrio-shellfish-infection", label: "Vibrio", re: /vibrio/i },
];

function linkedHazards(text: string | null): { id: string; label: string }[] {
  if (!text) return [];
  return HAZARD_MATCHERS.filter((h) => h.re.test(text)).map(({ id, label }) => ({ id, label }));
}

export default async function OceanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = OCEAN_CATALOG.find((x) => x.id === id);
  if (!o) notFound();

  const isHazard = o.group === "hazard";
  const month = new Date().getMonth() + 1;
  const images = OCEAN_GALLERY[o.id] ?? [];
  const hero = pickHero(images);
  const galleryRest = images.filter((im) => im.url !== hero?.url);
  const hazards = isHazard ? [] : linkedHazards(o.biotoxinNotes);

  return (
    <main className="relative z-10 px-6 pt-14 pb-6 lg:px-12 lg:pt-16 lg:max-w-[1280px] 2xl:max-w-none 2xl:px-16">
      <div className="running-head">
        <span className="chapter">Chapter VII · The Tide Line</span>
        <span className="center">{GROUP_LABEL[o.group]} · {o.commonNames[0]}</span>
        <span className="right">005</span>
      </div>

      <Link
        href="/ocean"
        className="font-mono inline-flex items-center gap-2"
        style={{ fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--rust)", textDecoration: "none" }}
      >
        ← Tide line
      </Link>

      <header className="mt-5">
        <div className="eyebrow mb-3">
          {GROUP_LABEL[o.group]} · {TIDE_LABEL[o.tidalZone]}
        </div>
        <h1 className="title-hero" style={{ fontSize: "clamp(34px, 6vw, 96px)" }}>
          {o.commonNames[0]}
        </h1>
        <div
          className="font-display italic mt-2"
          style={{ fontSize: 22, fontWeight: 350, color: "var(--rust)", letterSpacing: "-0.01em" }}
        >
          {o.scientific}
        </div>
        {o.commonNames.length > 1 && (
          <div className="font-body italic mt-2" style={{ fontSize: 14, color: "var(--ink-soft)" }}>
            Also: {o.commonNames.slice(1).join(", ")}
          </div>
        )}
      </header>

      {o.autoCompiled && (
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
          Auto-compiled from official and public sources (CDFW/CDPH · WDFW/WDOH ·
          ODFW/ODA · Sea Grant · NOAA). Shellfish safety changes daily —{" "}
          <strong>always confirm the current state biotoxin/quarantine advisory before harvesting.</strong>
        </div>
      )}

      <div className="mt-7">
        {hero ? (
          <figure style={{ margin: 0 }}>
            <img
              src={localImage(hero.url)}
              alt={o.scientific}
              style={{ width: "100%", aspectRatio: "16 / 7", objectFit: "cover", borderRadius: 16, background: "rgba(26,20,16,0.06)", display: "block" }}
            />
            {(hero.artist || hero.license) && (
              <figcaption className="font-mono mt-1.5" style={{ fontSize: 8.5, letterSpacing: "0.1em", color: "var(--ink-soft)", opacity: 0.6 }}>
                {[hero.artist, hero.license].filter(Boolean).join(" · ")}
              </figcaption>
            )}
          </figure>
        ) : (
          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 7",
              borderRadius: 16,
              background: isHazard
                ? "linear-gradient(135deg, rgba(160,40,40,0.12), rgba(192,84,32,0.07))"
                : "linear-gradient(135deg, rgba(46,68,82,0.1), rgba(63,82,56,0.07))",
              display: "grid",
              placeItems: "center",
              fontSize: 72,
            }}
          >
            <OceanEmoji species={o} />
          </div>
        )}
      </div>

      {galleryRest.length > 0 && (
        <PhotoGallery images={galleryRest} scientific={o.scientific} kindLabel={OCEAN_KIND_LABEL} />
      )}

      {!isHazard && o.harvestMonths.length > 0 && (
        <SeasonStrip harvest={o.harvestMonths} peak={o.peakMonths} currentMonth={month} note={o.seasonCue.notes} bestTide={o.bestTide} />
      )}

      <div className="lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-12 mt-10">
        <div className="space-y-8">
          <EdibilityBlock species={o} />

          {hazards.length > 0 && (
            <section
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: "rgba(160,40,40,0.06)",
                border: "1px solid rgba(160,40,40,0.28)",
                borderLeft: "3px solid #a02828",
              }}
            >
              <div className="font-mono" style={{ fontSize: 10, letterSpacing: "0.24em", color: "#a02828", textTransform: "uppercase", marginBottom: 8 }}>
                ☣ Biotoxin risk — check before harvesting
              </div>
              <p className="font-body" style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink)" }}>
                {o.biotoxinNotes}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {hazards.map((h) => (
                  <Link
                    key={h.id}
                    href={`/ocean/${h.id}`}
                    className="font-mono"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      padding: "5px 11px",
                      borderRadius: 999,
                      border: "1px solid rgba(160,40,40,0.4)",
                      color: "#a02828",
                      textDecoration: "none",
                    }}
                  >
                    {h.label} →
                  </Link>
                ))}
              </div>
            </section>
          )}

          {o.cautions && <CautionCallout text={o.cautions} deadly={isHazard} />}

          {o.regulations && (
            <Section title="Regulations">
              <p className="font-body" style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }}>
                {o.regulations}
              </p>
            </Section>
          )}

          {!isHazard && (
            <Section title="Preparation">
              <p className="font-body" style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--ink)" }}>
                {o.preparation}
              </p>
            </Section>
          )}

          <Section title="Identification">
            {o.identification.keyFeatures.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 mb-4" style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
                {o.identification.keyFeatures.map((f) => (
                  <li
                    key={f}
                    className="font-mono"
                    style={{ fontSize: 10, lineHeight: 1.3, letterSpacing: "0.02em", color: "var(--ink)", background: "rgba(26,20,16,0.05)", border: "1px solid var(--line)", borderRadius: 100, padding: "3px 9px" }}
                  >
                    {f}
                  </li>
                ))}
              </ul>
            )}
            {o.identification.form && <KVRow label="Form" value={o.identification.form} />}
            {o.identification.color && <KVRow label="Color" value={o.identification.color} />}
            {o.identification.texture && <KVRow label="Texture" value={o.identification.texture} />}
            {o.identification.size && <KVRow label="Size" value={o.identification.size} />}
            {o.identification.shell && <KVRow label="Shell" value={o.identification.shell} />}
            {o.identification.holdfast && <KVRow label="Holdfast" value={o.identification.holdfast} />}
          </Section>

          <Section title="Habitat">
            <p className="font-body" style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink)" }}>
              {o.habitat}
            </p>
            <KVRow label="Tidal zone" value={TIDE_LABEL[o.tidalZone]} />
            {o.bestTide && <KVRow label="Best tide" value={o.bestTide} />}
            {o.regionsPNW.length > 0 && <KVRow label="Coast" value={o.regionsPNW.join(" · ")} />}
          </Section>
        </div>

        <div className="space-y-8 mt-8 lg:mt-0">
          {!isHazard && (
            <Section title="What to gather">
              <KVRow label="Edible parts" value={o.edibleParts.join(", ") || "—"} />
              <KVRow
                label="Harvest"
                value={o.harvestMonths.length ? o.harvestMonths.map((m) => MONTH_ABBR[m - 1]).join(" · ") : "—"}
              />
              {o.seasonCue.notes && (
                <p className="font-body italic mt-3" style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                  {o.seasonCue.notes}
                </p>
              )}
            </Section>
          )}

          {o.lookalikes.length > 0 && (
            <Section title={`Lookalikes (${o.lookalikes.length})`}>
              <ul className="space-y-3 mt-2">
                {o.lookalikes.map((l) => (
                  <li key={`${l.scientific}·${l.name}`}>
                    <LookalikeCard lookalike={l} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!isHazard && (
            <Section title="Culinary">
              <KVRow label="Flavor" value={o.culinary.flavor} />
              <KVRow label="Uses" value={o.culinary.uses} />
              {o.culinary.preservation && <KVRow label="Preservation" value={o.culinary.preservation} />}
            </Section>
          )}

          {o.conservationNotes && (
            <Section title="Conservation">
              <p className="font-body" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink)" }}>
                {o.conservationNotes}
              </p>
            </Section>
          )}

          <Section title={`Sources (${o.sources.length})`}>
            <ul className="space-y-1.5 mt-1">
              {o.sources.map((src, i) => (
                <li key={`${src.url}·${i}`}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body"
                    style={{ fontSize: 13.5, color: "var(--rust)", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                  >
                    {src.name} ↗
                  </a>
                </li>
              ))}
            </ul>
            {o.verification && (
              <p className="font-mono mt-3" style={{ fontSize: 9.5, letterSpacing: "0.1em", color: "var(--ink-soft)", opacity: 0.7, textTransform: "uppercase" }}>
                {o.verification.sourcesAgreeing} sources · {o.verification.consensus} consensus · verified {o.verification.lastVerified}
              </p>
            )}
          </Section>
        </div>
      </div>
    </main>
  );
}

/* ─────────── pieces ─────────── */

function LookalikeCard({ lookalike: l }: { lookalike: OceanLookalike }) {
  const linkId = resolveLookalike(l);
  const thumb = linkId ? pickHero(OCEAN_GALLERY[linkId]) : undefined;
  const body = (
    <>
      <div className="flex items-start gap-3">
        {thumb && (
          <img
            src={localImage(thumb.thumb ?? thumb.url)}
            alt={l.scientific}
            loading="lazy"
            style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, flex: "none", background: "rgba(26,20,16,0.06)" }}
          />
        )}
        <div className="min-w-0 flex-1 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="font-display italic" style={{ fontSize: 17, color: "var(--moss)", lineHeight: 1.1 }}>
              {l.name}
            </div>
            <div className="font-display italic mt-0.5" style={{ fontSize: 13, color: "var(--rust)", opacity: 0.85 }}>
              {l.scientific}
            </div>
          </div>
          <DangerBadge danger={l.danger} />
        </div>
      </div>
      {l.keyFeatures && l.keyFeatures.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
          {l.keyFeatures.map((f) => (
            <li
              key={f}
              className="font-mono"
              style={{ fontSize: 9.5, lineHeight: 1.3, letterSpacing: "0.02em", color: "var(--ink)", background: "rgba(26,20,16,0.05)", border: "1px solid var(--line)", borderRadius: 100, padding: "2.5px 8px" }}
            >
              {f}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end justify-between gap-3">
        <p className="font-body mt-2" style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink)" }}>
          {l.distinguishingFeature}
        </p>
        {linkId && (
          <span aria-hidden className="font-mono flex-none" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--rust)", opacity: 0.6, textTransform: "uppercase", paddingBottom: 2 }}>
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
      <Link href={`/ocean/${linkId}`} style={{ ...style, textDecoration: "none", color: "inherit" }}>
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
      style={{ flex: "none", fontSize: 9, letterSpacing: "0.2em", color: "var(--parchment)", background: colors[danger], padding: "4px 9px", borderRadius: 100, textTransform: "uppercase", whiteSpace: "nowrap" }}
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
    <section style={{ padding: "14px 16px", borderRadius: 12, background: deadly ? "rgba(160,40,40,0.07)" : "rgba(168,116,44,0.08)", border: `1px solid ${fg}44`, borderLeft: `3px solid ${fg}` }}>
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: "0.24em", color: fg, textTransform: "uppercase", marginBottom: 6 }}>
        ⚠ {deadly ? "Hazard" : "Caution"}
      </div>
      <p className="font-body" style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }}>
        {text}
      </p>
    </section>
  );
}

function EdibilityBlock({ species }: { species: OceanSpecies }) {
  const m = oceanEdibilityMeta(species.edibility);
  return (
    <section style={{ padding: 20, borderRadius: 14, background: m.bg, border: `1px solid ${m.color}33` }}>
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: "0.28em", color: m.color, textTransform: "uppercase" }}>
        Edibility
      </div>
      <div className="font-display italic mt-2" style={{ fontSize: 22, fontWeight: 350, color: m.color, letterSpacing: "-0.01em" }}>
        {m.label}
      </div>
      <p className="font-body mt-1" style={{ fontSize: 14, color: "var(--ink)", opacity: 0.8, lineHeight: 1.5 }}>
        {m.sub}
      </p>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="font-mono mb-3" style={{ fontSize: 10, letterSpacing: "0.28em", color: "var(--rust)", textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
      <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "var(--ink-soft)", textTransform: "uppercase", opacity: 0.7, paddingTop: 2 }}>
        {label}
      </div>
      <div className="font-body" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink)" }}>
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
  bestTide,
}: {
  harvest: number[];
  peak: number[];
  currentMonth: number;
  note: string | null;
  bestTide: string | null;
}) {
  return (
    <div className="mt-8">
      <div className="font-mono mb-2" style={{ fontSize: 10, letterSpacing: "0.24em", color: "var(--ink-soft)", textTransform: "uppercase", opacity: 0.7 }}>
        Harvest season
      </div>
      <div className="grid grid-cols-12 gap-[3px]">
        {MONTH_ABBR.map((m, i) => {
          const mo = i + 1;
          const isHarvest = harvest.includes(mo);
          const isPeak = peak.includes(mo);
          const isToday = mo === currentMonth;
          return (
            <div
              key={m}
              className="text-center"
              style={{
                padding: "10px 2px 6px",
                borderRadius: 8,
                background: isPeak ? "var(--rust)" : isHarvest ? "rgba(63,82,56,0.5)" : "rgba(26, 20, 16, 0.05)",
                color: isPeak || isHarvest ? "var(--parchment)" : "var(--ink-soft)",
                outline: isToday ? "1.5px solid var(--rust)" : "none",
                outlineOffset: 2,
              }}
            >
              <div className="font-mono" style={{ fontSize: 9, letterSpacing: "0.14em", opacity: 0.85 }}>
                {m.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>
      {bestTide && (
        <div className="font-mono mt-3" style={{ fontSize: 9.5, letterSpacing: "0.14em", color: "var(--rain-deep)", textTransform: "uppercase" }}>
          ⌇ Best on {bestTide}
        </div>
      )}
      {note && (
        <p className="font-body italic mt-2" style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5, maxWidth: 640 }}>
          {note}
        </p>
      )}
    </div>
  );
}
