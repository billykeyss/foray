"use client";

import dayjs from "dayjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import SporeGauge from "@/components/spore-gauge";
import ForecastStrip from "@/components/forecast-strip";
import LocationChooser from "@/components/location-chooser";
import SpeciesPhoto from "@/components/species-photo";
import SpotFinder from "@/components/spot-finder";
import GreensInSeason from "@/components/greens-in-season";
import { useLocation } from "@/lib/location-context";
import { useRegion } from "@/lib/region-context";
import { computeSporeScore, suggestSpecies, scoreSpecies } from "@/lib/weather";
import { plantForecaster } from "@/lib/forecast/plant";

export default function TodayPage() {
  const { weather, loading, error, lat, lon } = useLocation();
  const { filterTerms } = useRegion();

  const greens = useMemo(
    () =>
      plantForecaster.suggest(
        { weather, now: new Date(), lat: lat ?? 0, lon: lon ?? 0 },
        filterTerms
      ),
    [weather, lat, lon, filterTerms]
  );

  const reading = useMemo(
    () => (weather.length ? computeSporeScore(weather) : null),
    [weather]
  );
  const species = useMemo(
    () => (reading ? suggestSpecies(reading, filterTerms) : null),
    [reading, filterTerms]
  );
  const speciesScore = useMemo(
    () => (species && reading ? scoreSpecies(species, reading) : null),
    [species, reading]
  );

  return (
    <main className="relative z-10 px-6 pt-14 lg:px-12 lg:pt-16 lg:max-w-[1280px] 2xl:max-w-none 2xl:px-16 2xl:pt-12">
      <div className="running-head">
        <span className="chapter">Chapter I · The Day&rsquo;s Reading</span>
        <span className="center">Foray · The Field Book · No. CCCXVII</span>
        <span className="right">001</span>
      </div>

      <header>
        <LocationChooser />

        <h1
          className="title-hero mt-4 2xl:mt-6"
          style={{ fontSize: "clamp(38px, 8vw, 124px)" }}
        >
          {dayjs().format("dddd")}{" "}
          <em>{reading?.hook ?? "is loading."}</em>
        </h1>
        <div
          className="font-mono mt-2 2xl:mt-3"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            opacity: 0.7,
          }}
        >
          {dayjs().format("MMM D")} · Day {reading?.daysSinceRain ?? "—"} after
          rain
        </div>
      </header>

      {loading && !reading && (
        <div className="text-center py-20 font-mono text-xs tracking-widest opacity-60">
          GATHERING DATA…
        </div>
      )}
      {error && (
        <div
          className="mt-6 card-paper text-sm"
          style={{ borderColor: "var(--rust)", color: "var(--rust-deep)" }}
        >
          {error}
        </div>
      )}

      {reading && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1.1fr)] lg:gap-10 lg:mt-12 mt-6">
          {/* Column 1 — Gauge */}
          <section className="lg:py-4">
            <SporeGauge score={reading.score} label={reading.label} />
            <div className="text-center mt-3">
              <div
                className="font-display italic"
                style={{
                  fontSize: 22,
                  fontWeight: 400,
                  color: "var(--rust)",
                }}
              >
                {reading.label}
              </div>
              <div
                className="font-mono mt-1"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  color: "var(--moss-soft)",
                  textTransform: "uppercase",
                }}
              >
                {reading.blurb}
              </div>
            </div>
          </section>

          {/* Column 2 — Stats + Forecast */}
          <section className="mt-6 lg:mt-0 lg:py-4">
            <div
              className="grid grid-cols-[1fr_1px_1fr] py-5"
              style={{
                borderTop: "1px solid var(--line)",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <Stat
                num={reading.rain7d.toFixed(0)}
                unit="mm"
                label="7-day rain"
              />
              <div style={{ background: "var(--line)" }} />
              <Stat
                num={reading.humidityToday.toFixed(0)}
                unit="%"
                label="Humidity"
              />
            </div>
            <div className="grid grid-cols-[1fr_1px_1fr] py-5 mt-[-1px]" style={{ borderBottom: "1px solid var(--line)" }}>
              <Stat
                num={reading.tempToday.toFixed(0)}
                unit="°C"
                label="Mean temp"
              />
              <div style={{ background: "var(--line)" }} />
              <Stat
                num={String(reading.daysSinceRain)}
                unit="d"
                label="Since rain"
              />
            </div>

            <div className="mt-6">
              <div className="flex justify-between items-baseline mb-3">
                <h2
                  className="font-display italic"
                  style={{
                    fontSize: 19,
                    fontWeight: 350,
                    color: "var(--moss)",
                  }}
                >
                  The week ahead
                </h2>
                <Link
                  href="/charts"
                  className="font-mono"
                  style={{
                    fontSize: 9.5,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--rust)",
                  }}
                >
                  Detail →
                </Link>
              </div>
              <ForecastStrip days={weather} />
            </div>
          </section>

          {/* Column 3 — Species (or honest empty state) */}
          {species && speciesScore ? (
            <SpeciesCard
              species={species}
              speciesScore={speciesScore}
              reading={reading}
            />
          ) : (
            <NoSpeciesCard reading={reading} />
          )}
        </div>
      )}

      <GreensInSeason
        items={greens}
        title={plantForecaster.title}
        emptyState={plantForecaster.emptyState}
      />

      {reading && <SpotFinder />}
    </main>
  );
}

function Stat({
  num,
  unit,
  label,
}: {
  num: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="px-2.5">
      <div
        className="font-display"
        style={{
          fontWeight: 350,
          fontSize: 34,
          color: "var(--moss)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {num}
        <sup
          className="font-mono"
          style={{
            fontSize: 13,
            marginLeft: 3,
            color: "var(--moss-soft)",
            fontWeight: 400,
            top: 4,
          }}
        >
          {unit}
        </sup>
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--ink-soft)",
          marginTop: 6,
          opacity: 0.7,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function SpeciesCard({
  species,
  speciesScore,
  reading,
}: {
  species: NonNullable<ReturnType<typeof suggestSpecies>>;
  speciesScore: ReturnType<typeof scoreSpecies>;
  reading: NonNullable<ReturnType<typeof computeSporeScore>>;
}) {
  const [open, setOpen] = useState(false);
  const deadlyLookalike = species.lookalikes.find((l) => l.danger === "deadly");
  return (
    <section
      className="mt-7 lg:mt-0 p-5 lg:p-6 relative overflow-hidden"
      style={{
        background: "var(--moss)",
        borderRadius: 22,
        color: "var(--parchment)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -30,
          top: -30,
          width: 200,
          height: 200,
          background:
            "radial-gradient(circle, rgba(200, 122, 74, 0.28), transparent 65%)",
          pointerEvents: "none",
        }}
      />
      <div className="flex justify-between items-start">
        <div
          className="font-mono"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.24em",
            color: "var(--cap)",
            textTransform: "uppercase",
          }}
        >
          Conditions favor
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "rgba(240, 228, 200, 0.5)",
          }}
        >
          {speciesScore.match}/{speciesScore.total} criteria
        </div>
      </div>
      <div
        className="flex gap-4 items-start mt-3"
        style={{ position: "relative", zIndex: 1 }}
      >
        <Link
          href={`/catalog/${species.id}`}
          aria-label={`Open ${species.commonNames[0]} in catalog`}
          style={{ flex: "none", display: "block" }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(240, 228, 200, 0.15)",
            }}
          >
            <SpeciesPhoto
              speciesId={species.id}
              scientific={species.scientific}
              variant="thumb"
            />
          </div>
        </Link>
        <div
          className="font-display italic"
          style={{
            fontSize: 26,
            fontWeight: 350,
            lineHeight: 1.05,
            color: "var(--parchment)",
            paddingTop: 2,
          }}
        >
          {species.commonNames[0]}
          <br />
          <em style={{ fontStyle: "normal", color: "var(--cap)", fontSize: 18 }}>
            {species.scientific}
          </em>
        </div>
      </div>
      <p
        className="font-body mt-3"
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: "rgba(240, 228, 200, 0.78)",
          maxWidth: 360,
        }}
      >
        {species.habitat}
      </p>

      {/* Host trees — the most useful field-level cue */}
      {species.hostTrees.length > 0 && (
        <div className="mt-4">
          <div
            className="font-mono mb-2"
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              color: "rgba(240, 228, 200, 0.5)",
              textTransform: "uppercase",
            }}
          >
            {species.trophicMode === "mycorrhizal"
              ? "Mycorrhizal partners"
              : species.trophicMode === "parasitic"
                ? "Host trees"
                : "Found on / near"}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {species.hostTrees.slice(0, 5).map((h) => (
              <span
                key={h.scientific}
                className="font-body"
                style={{
                  fontSize: 13,
                  color: "var(--parchment)",
                  opacity: 0.85,
                }}
              >
                {h.common}{" "}
                <em
                  className="font-display italic"
                  style={{
                    color: "var(--cap)",
                    fontSize: 12,
                    opacity: 0.8,
                  }}
                >
                  {h.scientific}
                </em>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4 flex-wrap">
        {speciesScore.criteria.map((c) => (
          <span
            key={c.label}
            className="font-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.12em",
              color: "var(--parchment)",
              border: `1px solid ${c.met ? "rgba(185, 211, 154, 0.45)" : "rgba(240, 228, 200, 0.2)"}`,
              borderRadius: 100,
              padding: "5px 10px",
              textTransform: "uppercase",
              background: c.met
                ? "rgba(185, 211, 154, 0.08)"
                : "transparent",
            }}
          >
            <span
              style={{
                color: c.met ? "#b9d39a" : "rgba(240, 228, 200, 0.4)",
                marginRight: 5,
              }}
            >
              {c.met ? "✓" : "·"}
            </span>
            {c.label}
          </span>
        ))}
      </div>

      {/* Deadly lookalike warning — surfaced before the user has to ask */}
      {deadlyLookalike && (
        <div
          className="mt-4 p-3 flex items-start gap-2.5"
          style={{
            background: "rgba(217, 154, 130, 0.12)",
            border: "1px solid rgba(217, 154, 130, 0.35)",
            borderRadius: 10,
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.22em",
              color: "#e09b82",
              textTransform: "uppercase",
              flex: "none",
              marginTop: 1,
            }}
          >
            Beware
          </span>
          <span
            className="font-body"
            style={{
              fontSize: 13,
              lineHeight: 1.4,
              color: "rgba(240, 228, 200, 0.85)",
            }}
          >
            Deadly lookalike:{" "}
            <em
              className="font-display italic"
              style={{ color: "#f0c7b5" }}
            >
              {deadlyLookalike.scientific}
            </em>{" "}
            — {deadlyLookalike.distinguishingFeature}
          </span>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="font-mono mt-5 inline-flex items-center gap-2"
        style={{
          background: "transparent",
          border: 0,
          color: "var(--cap)",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? "Hide details" : "Why this match"}{" "}
        <span
          style={{
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}
        >
          ↓
        </span>
      </button>

      {open && (
        <div
          className="mt-4 pt-4"
          style={{ borderTop: "1px solid rgba(240, 228, 200, 0.18)" }}
        >
          <ul
            className="font-mono space-y-1.5"
            style={{
              fontSize: 11,
              color: "rgba(240, 228, 200, 0.78)",
              letterSpacing: "0.04em",
              lineHeight: 1.5,
            }}
          >
            <li>
              <span style={{ color: "var(--cap)" }}>Rain</span> · prefers ≥{" "}
              {species.conditions.minRain7d}mm/7d · today{" "}
              {reading.rain7d.toFixed(0)}mm
            </li>
            <li>
              <span style={{ color: "var(--cap)" }}>Days since rain</span> ·
              prefers {species.conditions.idealDaysSinceRain[0]}–
              {species.conditions.idealDaysSinceRain[1]}d · today{" "}
              {reading.daysSinceRain}d
            </li>
            <li>
              <span style={{ color: "var(--cap)" }}>Temperature</span> ·
              prefers {species.conditions.tempRangeC[0]}–
              {species.conditions.tempRangeC[1]}°C · today{" "}
              {reading.tempToday.toFixed(0)}°C
            </li>
            {species.conditions.humidityMinPct != null && (
              <li>
                <span style={{ color: "var(--cap)" }}>Humidity</span> · prefers
                ≥ {species.conditions.humidityMinPct}% · today{" "}
                {reading.humidityToday.toFixed(0)}%
              </li>
            )}
            <li>
              <span style={{ color: "var(--cap)" }}>Season</span> ·{" "}
              {species.fruitingMonths.length === 12
                ? "year-round"
                : `months ${species.fruitingMonths.join(", ")}`}
            </li>
          </ul>

          {species.culinary.flavor && (
            <p
              className="font-body italic mt-3"
              style={{
                fontSize: 13.5,
                lineHeight: 1.5,
                color: "rgba(240, 228, 200, 0.7)",
              }}
            >
              {species.culinary.flavor}
            </p>
          )}

          {species.sources.length > 0 && (
            <div
              className="font-mono mt-4"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.16em",
                color: "rgba(240, 228, 200, 0.45)",
                textTransform: "uppercase",
              }}
            >
              Source: {species.sources[0].name}
            </div>
          )}

          <p
            className="font-body italic mt-3"
            style={{
              fontSize: 12.5,
              color: "rgba(240, 228, 200, 0.45)",
              lineHeight: 1.5,
            }}
          >
            A heuristic, not an oracle. Always confirm finds with a regional
            guide before eating. 50 species in the PNW catalog.
          </p>
        </div>
      )}
    </section>
  );
}

function NoSpeciesCard({
  reading,
}: {
  reading: ReturnType<typeof computeSporeScore>;
}) {
  const { def: regionDef } = useRegion();
  const reasons: string[] = [];
  if (!reading) return null;
  if (reading.score < 45) {
    reasons.push("the Spore Score is below 45");
  }
  if (reading.rain7d < 5) {
    reasons.push("there's been less than 5mm of rain in the past week");
  }
  const reasonText =
    reasons.length === 0
      ? "no in-region species in the catalog matches enough current criteria"
      : reasons.join(" and ");
  return (
    <section
      className="mt-7 lg:mt-0 p-5 lg:p-6 relative overflow-hidden"
      style={{
        background: "rgba(44, 58, 42, 0.06)",
        border: "1px dashed var(--line)",
        borderRadius: 22,
        color: "var(--moss)",
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.24em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
        }}
      >
        No favorable species
      </div>
      <div
        className="font-display italic mt-3"
        style={{
          fontSize: 24,
          fontWeight: 350,
          lineHeight: 1.1,
          color: "var(--moss)",
        }}
      >
        Nothing&rsquo;s fruiting today.
      </div>
      <p
        className="font-body mt-3"
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--ink-soft)",
        }}
      >
        With a Spore Score of <strong>{reading.score}</strong>,{" "}
        {reasonText} in the{" "}
        <strong>{regionDef.label.toLowerCase()}</strong> catalog. Check back
        after the next storm — most species in this region need 15–25mm of
        rain to trigger a flush.
      </p>
    </section>
  );
}
