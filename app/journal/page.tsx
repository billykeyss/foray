"use client";

import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { entryKind, useJournal, type JournalWeatherSnapshot } from "@/lib/journal";
import JournalCatchFields, { type CatchForm } from "@/components/journal-catch-fields";
import { useSavedSpots } from "@/lib/saved-spots.ts";
import { localIsoDate } from "@/lib/fishing/local-date.ts";
import { FISH_WATERS } from "@/lib/fishing/waters-index.ts";
import Link from "next/link";
import { useLocation } from "@/lib/location-context";
import { computeSporeScore } from "@/lib/weather";
import { compressPhoto, dataUrlSize } from "@/lib/photo";
import { getCurrentGps, formatLatLon } from "@/lib/geo";

export default function JournalPage() {
  const { entries, loaded, add, update, remove } = useJournal();
  const { lat, lon, label, weather } = useLocation();
  const reading = useMemo(
    () => (weather.length ? computeSporeScore(weather) : null),
    [weather],
  );

  // Computed extras for the weather snapshot
  const todayStr = dayjs().format("YYYY-MM-DD");
  const rain24h = useMemo(() => {
    const today = weather.find((w) => w.time === todayStr);
    return today?.precipitation;
  }, [weather, todayStr]);

  // ─── Form state ───
  /** null = closed.  "new" = creating.  string = editing entry by id. */
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const open = editing !== null;
  const mode: "new" | "edit" = editing === "new" || editing === null ? "new" : "edit";
  const editingEntry = useMemo(
    () =>
      mode === "edit" && typeof editing === "string"
        ? entries.find((e) => e.id === editing)
        : null,
    [mode, editing, entries],
  );

  const [species, setSpecies] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [formLat, setFormLat] = useState<string>("");
  const [formLon, setFormLon] = useState<string>("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { spots: savedSpots, remove: removeSpot } = useSavedSpots();
  const [formKind, setFormKind] = useState<"find" | "catch">("find");
  const EMPTY_CATCH: CatchForm = { waterSlug: "", species: "", length: "", kept: false, reachId: "" };
  const [catchForm, setCatchForm] = useState<CatchForm>(EMPTY_CATCH);

  // Seed form values when opened
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && editingEntry) {
      setFormKind(entryKind(editingEntry));
      const c = editingEntry.catch;
      setCatchForm(
        c
          ? { waterSlug: c.waterSlug ?? "", species: c.species ?? "", length: c.length_in != null ? String(c.length_in) : "", kept: c.kept, reachId: c.reachId ?? "" }
          : EMPTY_CATCH,
      );
      setSpecies(editingEntry.species);
      setNotes(editingEntry.notes ?? "");
      setPhoto(editingEntry.photoDataUrl ?? null);
      setFormLat(editingEntry.lat != null ? editingEntry.lat.toFixed(5) : "");
      setFormLon(editingEntry.lon != null ? editingEntry.lon.toFixed(5) : "");
    } else {
      setFormKind("find");
      setCatchForm(EMPTY_CATCH);
      if (lat != null && lon != null) {
        setFormLat(lat.toFixed(5));
        setFormLon(lon.toFixed(5));
      }
    }
    setGpsError(null);
    setSaveError(null);
    setGpsAccuracy(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEntry?.id]);

  const resetForm = () => {
    setSpecies("");
    setNotes("");
    setPhoto(null);
    setFormLat("");
    setFormLon("");
    setGpsAccuracy(null);
    setGpsError(null);
    setSaveError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const url = await compressPhoto(file, 1024, 0.85);
      setPhoto(url);
    } catch (err) {
      console.error(err);
      setSaveError("Could not read that photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  const onUseCurrentGps = async () => {
    setGpsBusy(true);
    setGpsError(null);
    try {
      const fix = await getCurrentGps();
      setFormLat(fix.lat.toFixed(5));
      setFormLon(fix.lon.toFixed(5));
      setGpsAccuracy(fix.accuracy);
    } catch (e: any) {
      setGpsError(e?.message ?? "GPS unavailable — enter manually");
    } finally {
      setGpsBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const isCatch = formKind === "catch";
    if (isCatch ? !catchForm.waterSlug : !species.trim()) return;

    const parsedLat = formLat ? Number(formLat) : undefined;
    const parsedLon = formLon ? Number(formLon) : undefined;
    const cleanLat =
      Number.isFinite(parsedLat) && Math.abs(parsedLat!) <= 90
        ? parsedLat
        : undefined;
    const cleanLon =
      Number.isFinite(parsedLon) && Math.abs(parsedLon!) <= 180
        ? parsedLon
        : undefined;

    const snapshot: JournalWeatherSnapshot | undefined = reading
      ? {
          tempC: reading.tempToday,
          rain7d: reading.rain7d,
          rain24h,
          daysSinceRain: reading.daysSinceRain,
          humidityPct: reading.humidityToday,
          score: reading.score,
          label: reading.label,
        }
      : undefined;

    const catchSpecies = catchForm.species.trim();
    const lenNum = catchForm.length.trim() === "" ? undefined : Number(catchForm.length);
    const catchData = {
      waterSlug: catchForm.waterSlug,
      species: catchSpecies || undefined,
      length_in: lenNum != null && Number.isFinite(lenNum) ? lenNum : undefined,
      kept: catchForm.kept,
      reachId: catchForm.reachId || undefined,
    };
    const waterName = FISH_WATERS.find((w) => w.slug === catchForm.waterSlug)?.name ?? "Unnamed water";

    try {
      if (mode === "edit" && editingEntry && isCatch) {
        update(editingEntry.id, {
          species: catchSpecies || "Catch",
          location: waterName,
          notes: notes.trim(),
          lat: cleanLat,
          lon: cleanLon,
          photoDataUrl: photo ?? undefined,
          kind: "catch",
          catch: catchData,
        });
      } else if (mode === "edit" && editingEntry) {
        // Edits preserve the original date / capturedAt / weather snapshot —
        // only the user-edited fields change. (Conditions were the conditions
        // at find-time; we shouldn't rewrite them after the fact.)
        update(editingEntry.id, {
          species: species.trim(),
          notes: notes.trim(),
          lat: cleanLat,
          lon: cleanLon,
          photoDataUrl: photo ?? undefined,
        });
      } else if (isCatch) {
        add({
          date: localIsoDate(),
          capturedAt: new Date().toISOString(),
          species: catchSpecies || "Catch",
          location: waterName,
          notes: notes.trim(),
          lat: cleanLat,
          lon: cleanLon,
          photoDataUrl: photo ?? undefined,
          kind: "catch",
          catch: catchData,
        });
      } else {
        add({
          date: dayjs().format("YYYY-MM-DD"),
          capturedAt: dayjs().toISOString(),
          species: species.trim(),
          location: label || "Unnamed spot",
          notes: notes.trim(),
          lat: cleanLat,
          lon: cleanLon,
          photoDataUrl: photo ?? undefined,
          weather: snapshot,
          // back-compat top-level fields
          score: snapshot?.score,
          rain7d: snapshot?.rain7d,
        });
      }
      resetForm();
      setEditing(null);
    } catch (err) {
      // Most likely localStorage quota exceeded (photos too large)
      setSaveError(
        "Save failed — likely out of local storage. Try a smaller photo or delete older entries.",
      );
    }
  };

  return (
    <main className="relative z-10 px-6 pt-14 pb-6 lg:px-12 lg:pt-16 lg:max-w-[1280px]">
      <div className="eyebrow mb-3" style={{ color: "var(--moss)" }}>
        {entries.length} {entries.length === 1 ? "entry" : "entries"} · This
        season
      </div>
      <h1
        className="title-hero"
        style={{ fontSize: "clamp(34px, 7vw, 72px)" }}
      >
        Things I have <em>found</em>.
      </h1>
      <p
        className="font-mono mt-2"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--ink-soft)",
          opacity: 0.7,
        }}
      >
        Pin a spot. Log what fruited. Watch the patterns.
      </p>

      {!loaded && (
        <div
          className="text-center py-20 font-mono"
          style={{ fontSize: 11, letterSpacing: "0.22em", opacity: 0.6 }}
        >
          OPENING JOURNAL…
        </div>
      )}

      {loaded && entries.length === 0 && (
        <div className="card-paper mt-6 text-center" style={{ padding: 28 }}>
          <div
            className="font-display italic"
            style={{
              fontSize: 19,
              color: "var(--moss)",
              marginBottom: 6,
            }}
          >
            The pages are blank.
          </div>
          <p
            className="font-body"
            style={{ fontSize: 14, color: "var(--ink-soft)" }}
          >
            Tap + to log your first find.
          </p>
        </div>
      )}

      <ul className="mt-5 lg:mt-10 lg:grid lg:grid-cols-2 lg:gap-x-12 xl:grid-cols-3 lg:gap-y-0">
        {entries.map((e) => (
          <li
            key={e.id}
            className="grid grid-cols-[56px_1fr] gap-3.5 py-5"
            style={{ borderBottom: "1px solid var(--line)" }}
          >
            <div
              className="text-center pt-0.5 pr-3"
              style={{ borderRight: "1px solid var(--line-soft)" }}
            >
              <div
                className="font-display"
                style={{
                  fontSize: 26,
                  fontWeight: 350,
                  color: "var(--moss)",
                  lineHeight: 1,
                }}
              >
                {dayjs(e.date).format("DD")}
              </div>
              <div
                className="font-mono mt-1"
                style={{
                  fontSize: 8.5,
                  letterSpacing: "0.22em",
                  color: "var(--ink-soft)",
                  textTransform: "uppercase",
                }}
              >
                {dayjs(e.date).format("MMM")}
              </div>
            </div>
            <div className="relative">
              <div
                className="font-display italic"
                style={{
                  fontSize: 19,
                  fontWeight: 350,
                  color: "var(--moss)",
                  lineHeight: 1.15,
                  paddingRight: 24,
                }}
              >
                {e.species}
                {entryKind(e) === "catch" && <span className="kp kp-catch-tag">Catch</span>}
              </div>
              {e.catch && (
                <div className="font-mono mt-1.5" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-soft)" }}>
                  {e.catch.length_in != null ? `${e.catch.length_in} in · ` : ""}
                  {e.catch.kept ? "kept" : "released"}
                </div>
              )}
              <div
                className="font-mono mt-1.5"
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  color: "var(--ink-soft)",
                  textTransform: "uppercase",
                  opacity: 0.75,
                }}
              >
                {e.location}
                {e.lat != null && e.lon != null && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    · {formatLatLon(e.lat, e.lon, 3)}
                  </span>
                )}
              </div>

              {e.photoDataUrl && (
                <img
                  src={e.photoDataUrl}
                  alt={e.species}
                  className="mt-2.5"
                  style={{
                    width: "100%",
                    maxWidth: 360,
                    aspectRatio: "4 / 3",
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid var(--line)",
                    display: "block",
                  }}
                />
              )}

              {e.notes && (
                <p
                  className="font-body mt-2"
                  style={{
                    fontSize: 14,
                    color: "var(--ink)",
                    lineHeight: 1.4,
                  }}
                >
                  {e.notes}
                </p>
              )}

              <div
                className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2.5 font-mono"
                style={{
                  fontSize: 9.5,
                  color: "var(--moss-soft)",
                  letterSpacing: "0.1em",
                }}
              >
                {e.weather?.rain24h != null && (
                  <span>☂ 24h {e.weather.rain24h.toFixed(0)}mm</span>
                )}
                {(e.weather?.rain7d ?? e.rain7d) != null && (
                  <span>
                    ☂ 7d {(e.weather?.rain7d ?? e.rain7d!).toFixed(0)}mm
                  </span>
                )}
                {e.weather?.daysSinceRain != null && (
                  <span>+{e.weather.daysSinceRain}d since rain</span>
                )}
                {e.weather?.tempC != null && (
                  <span>{e.weather.tempC.toFixed(0)}°C</span>
                )}
                {(e.weather?.score ?? e.score) != null && (
                  <span>● {e.weather?.score ?? e.score} score</span>
                )}
              </div>

              <div
                className="absolute top-0 right-0 flex items-center gap-1"
              >
                <button
                  onClick={() => setEditing(e.id)}
                  aria-label="Edit entry"
                  className="font-mono"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--line)",
                    borderRadius: 999,
                    color: "var(--ink-soft)",
                    cursor: "pointer",
                    fontSize: 9,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    padding: "3px 9px",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(e.id)}
                  aria-label="Delete entry"
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--ink-soft)",
                    opacity: 0.4,
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {loaded && (
        <section className="kp kp-spots" aria-label="Saved spots">
          <h2>Saved spots · {savedSpots.length}</h2>
          {savedSpots.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--kp-ink-64)" }}>Long-press the map, then tap Save spot.</p>
          )}
          {savedSpots.map((sp) => (
            <div key={sp.id} className="kp-spot-row">
              <Link href={`/?lat=${sp.lat}&lon=${sp.lon}`}>
                {sp.label}
                <small>
                  {sp.kind === "both" ? "forage + fish" : sp.kind} · {formatLatLon(sp.lat, sp.lon, 3)}
                </small>
              </Link>
              <button type="button" onClick={() => removeSpot(sp.id)} aria-label={`Remove ${sp.label}`}>
                Remove
              </button>
            </div>
          ))}
        </section>
      )}

      {/* FAB */}
      <button
        onClick={() => setEditing("new")}
        aria-label="New entry"
        className="fixed z-[60] grid place-items-center fab-position"
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--rust)",
          color: "var(--parchment)",
          border: "2px solid var(--parchment)",
          boxShadow: "0 12px 28px -8px rgba(125, 52, 24, 0.5)",
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 5 L12 19 M5 12 L19 12" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] grid items-end"
          style={{ background: "rgba(26, 20, 16, 0.45)" }}
          onClick={() => {
            resetForm();
            setEditing(null);
          }}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-[480px] p-6"
            style={{
              background: "var(--parchment)",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              boxShadow: "0 -30px 60px -30px rgba(0,0,0,0.4)",
              paddingBottom: "max(24px, env(safe-area-inset-bottom))",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
          >
            <div
              className="mx-auto mb-4"
              style={{
                width: 36,
                height: 4,
                borderRadius: 4,
                background: "var(--line)",
              }}
            />
            <h2 className="title-hero" style={{ fontSize: 28, marginBottom: 4 }}>
              {mode === "edit" ? (
                <>
                  Edit <em>{formKind === "catch" ? "catch" : "finding"}</em>.
                </>
              ) : (
                <>
                  New <em>{formKind === "catch" ? "catch" : "finding"}</em>.
                </>
              )}
            </h2>
            <p
              className="font-mono mb-5"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.2em",
                color: "var(--ink-soft)",
                textTransform: "uppercase",
              }}
            >
              {mode === "edit" && editingEntry
                ? `Logged ${dayjs(editingEntry.date).format("MMM D")} · ${editingEntry.location}`
                : (
                  <>
                    {label || "Set location first"}
                    {reading && ` · Score ${reading.score}`}
                  </>
                )}
            </p>

            {mode === "new" && (
              <div className="kp mb-4">
                <div className="kp-seg" role="group" aria-label="Entry type">
                  <button type="button" aria-pressed={formKind === "find"} onClick={() => setFormKind("find")}>
                    Find
                  </button>
                  <button type="button" aria-pressed={formKind === "catch"} onClick={() => setFormKind("catch")}>
                    Catch
                  </button>
                </div>
              </div>
            )}

            {formKind === "catch" ? (
              <JournalCatchFields
                value={catchForm}
                onChange={(patch) => setCatchForm((c) => ({ ...c, ...patch }))}
                date={mode === "edit" && editingEntry ? editingEntry.date : localIsoDate()}
                near={lat != null && lon != null ? { lat, lon } : null}
              />
            ) : (
              <>
                <FieldLabel>Species</FieldLabel>
                <input
                  autoFocus
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  placeholder="Golden chanterelle"
                  className="field-input mb-4"
                />
              </>
            )}

            <FieldLabel>Photo</FieldLabel>
            <div className="mb-4">
              {photo ? (
                <div className="relative">
                  <img
                    src={photo}
                    alt="Selected"
                    style={{
                      width: "100%",
                      aspectRatio: "4 / 3",
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      display: "block",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="font-mono"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: 0,
                      background: "rgba(26,20,16,0.7)",
                      color: "var(--parchment)",
                      fontSize: 9,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="journal-photo"
                  className="font-mono"
                  style={{
                    display: "block",
                    padding: "16px",
                    border: "1px dashed var(--line)",
                    borderRadius: 10,
                    textAlign: "center",
                    background: "rgba(255,255,255,0.4)",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: photoBusy ? "var(--ink-soft)" : "var(--rust)",
                    cursor: "pointer",
                  }}
                >
                  {photoBusy ? "Compressing…" : "+ Take or choose photo"}
                </label>
              )}
              <input
                id="journal-photo"
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              />
              {photo && (
                <div
                  className="font-mono mt-1"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: "var(--ink-soft)",
                    opacity: 0.65,
                  }}
                >
                  {(dataUrlSize(photo) / 1024).toFixed(0)} KB compressed
                </div>
              )}
            </div>

            <FieldLabel>Coordinates · tap to edit</FieldLabel>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <SubLabel>Latitude</SubLabel>
                <input
                  value={formLat}
                  onChange={(e) => setFormLat(e.target.value)}
                  inputMode="decimal"
                  placeholder="39.31200"
                  className="field-input"
                  style={{ marginBottom: 0 }}
                  aria-label="Latitude"
                />
              </div>
              <div>
                <SubLabel>Longitude</SubLabel>
                <input
                  value={formLon}
                  onChange={(e) => setFormLon(e.target.value)}
                  inputMode="decimal"
                  placeholder="-119.89600"
                  className="field-input"
                  style={{ marginBottom: 0 }}
                  aria-label="Longitude"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onUseCurrentGps}
              disabled={gpsBusy}
              className="font-mono"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--moss)",
                background: gpsBusy ? "var(--moss-soft)" : "var(--moss)",
                color: "var(--parchment)",
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                cursor: gpsBusy ? "wait" : "pointer",
                marginBottom: 6,
              }}
              aria-label="Use current GPS location"
            >
              {gpsBusy ? "Getting GPS fix…" : "📍 Use my current location"}
            </button>
            <div
              className="font-mono mb-4"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                color: gpsError ? "var(--rust)" : "var(--ink-soft)",
                opacity: gpsError ? 1 : 0.65,
                minHeight: 14,
              }}
            >
              {gpsError ??
                (gpsAccuracy != null
                  ? `±${gpsAccuracy.toFixed(0)} m accuracy · edit the fields above to adjust`
                  : "Edit the fields above, or tap the button for a fresh GPS fix")}
            </div>

            {formKind === "find" && (
              <>
                <FieldLabel>
                  {mode === "edit" ? "Conditions at find-time" : "Conditions"}
                </FieldLabel>
                <ConditionsCard
                  mode={mode}
                  reading={reading}
                  rain24h={rain24h}
                  snapshot={editingEntry?.weather}
                />
              </>
            )}

            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Habitat, count, conditions…"
              rows={3}
              className="field-input mb-4"
              style={{ resize: "none" }}
            />

            {saveError && (
              <div
                className="font-mono mb-3"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  color: "var(--rust)",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(189, 122, 18, 0.08)",
                  border: "1px solid var(--rust)",
                }}
              >
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setEditing(null);
                }}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {mode === "edit" ? "Save changes" : "Save entry"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="font-mono block mb-1.5"
      style={{
        fontSize: 9,
        letterSpacing: "0.22em",
        color: "var(--ink-soft)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

type ReadingLike = {
  score: number;
  rain7d: number;
  daysSinceRain: number;
  tempToday: number;
  humidityToday: number;
};

function ConditionsCard({
  mode,
  reading,
  rain24h,
  snapshot,
}: {
  mode: "new" | "edit";
  reading: ReadingLike | null;
  rain24h?: number;
  snapshot?: JournalWeatherSnapshot;
}) {
  // In edit-mode we show the saved snapshot (read-only history). In new-mode
  // we show the current live reading, which is what'll be frozen on save.
  const show =
    mode === "edit" && snapshot
      ? {
          score: snapshot.score,
          rain24h: snapshot.rain24h,
          rain7d: snapshot.rain7d,
          daysSinceRain: snapshot.daysSinceRain,
          tempC: snapshot.tempC,
          humidityPct: snapshot.humidityPct,
        }
      : reading
        ? {
            score: reading.score,
            rain24h,
            rain7d: reading.rain7d,
            daysSinceRain: reading.daysSinceRain,
            tempC: reading.tempToday,
            humidityPct: reading.humidityToday,
          }
        : null;

  return (
    <div
      className="mb-4 p-3 font-mono"
      style={{
        border: "1px solid var(--line-soft)",
        borderRadius: 10,
        background: "rgba(255,255,255,0.35)",
        fontSize: 10.5,
        letterSpacing: "0.06em",
        color: "var(--ink)",
        lineHeight: 1.65,
      }}
    >
      {!show && (
        <span style={{ opacity: 0.6 }}>
          {mode === "edit"
            ? "No weather snapshot was saved with this entry."
            : "Weather unavailable — set a location first"}
        </span>
      )}
      {show && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                fontSize: 9,
                opacity: 0.65,
              }}
            >
              Spore score
            </span>
            {show.score != null && (
              <span
                className="font-display"
                style={{
                  fontSize: 22,
                  color: "var(--moss)",
                  fontWeight: 350,
                }}
              >
                {show.score}
              </span>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: 12,
              rowGap: 2,
              opacity: 0.85,
            }}
          >
            {show.rain24h != null && (
              <span>☂ 24h {show.rain24h.toFixed(0)}mm</span>
            )}
            {show.rain7d != null && (
              <span>☂ 7d {show.rain7d.toFixed(0)}mm</span>
            )}
            {show.daysSinceRain != null && (
              <span>+{show.daysSinceRain}d since rain</span>
            )}
            {show.tempC != null && <span>{show.tempC.toFixed(0)}°C</span>}
            {show.humidityPct != null && (
              <span>{show.humidityPct.toFixed(0)}% humidity</span>
            )}
          </div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              opacity: 0.55,
              marginTop: 6,
            }}
          >
            {mode === "edit"
              ? "Locked at the moment of the find"
              : "Snapshotted at save"}
          </div>
        </>
      )}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-mono"
      style={{
        fontSize: 8.5,
        letterSpacing: "0.2em",
        color: "var(--ink-soft)",
        textTransform: "uppercase",
        opacity: 0.7,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}
