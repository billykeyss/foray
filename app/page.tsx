"use client";

import dayjs from "dayjs";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import LocationChooser from "@/components/location-chooser";
import UnifiedSearch, { type SpeciesHit } from "@/components/unified-search";
import { searchCatalog } from "@/lib/chat/tools.ts";
import { speciesRoute } from "@/lib/chat/species-route.ts";
import TripCard from "@/components/trip-card/trip-card";
import ForageHalf, { type ForagePick } from "@/components/trip-card/forage-half";
import FishHalf, { useNearbyFish } from "@/components/trip-card/fish-half";
import TodayDetail from "@/components/trip-card/today-detail";
import { RulesSheet, type Line } from "@/components/fishing/rules-sheet";
import { useLocation } from "@/lib/location-context";
import { useRegion } from "@/lib/region-context";
import { useUnits } from "@/lib/units-context";
import { computeSporeScore, suggestSpeciesList, type DailyWeather } from "@/lib/weather";
import { settledFishStatuses, tripHeadline } from "@/lib/trip-headline.ts";
import { FISH_WATERS } from "@/lib/fishing/waters-index.ts";
import { nearestWaters } from "@/lib/fishing/nearby.ts";
import { defaultSpotKind, useSavedSpots, type SpotKind } from "@/lib/saved-spots.ts";
import { useLocalToday } from "@/lib/use-local-today.ts";
import { NO_OVERLAYS } from "@/components/field-map/layers.ts";
import type { FieldMapProps } from "@/components/field-map/field-map.tsx";
import FindSheet, { type PickerItem } from "@/components/forage-find/find-sheet";
import { FINDABLE_IDS, FINDABLE_PROFILES } from "@/lib/forage-find/catalog.ts";
import { inSeasonNow, monthsText, seasonStatus } from "@/lib/forage-find/profiles.ts";
import { DEFAULT_RADIUS_KM, RADII_KM, type FindResult, type FoundSpot } from "@/lib/forage-find/run.ts";
import { useForageFind } from "@/lib/forage-find/use-forage-find.ts";
import { haversineKm } from "@/lib/forage-find/geo.ts";
import { JOURNAL_DRAFT_KEY } from "@/lib/journal-draft.ts";

const FieldMap = dynamic(() => import("@/components/field-map/field-map.tsx"), {
  ssr: false,
  loading: () => (
    <div
      className="absolute inset-0 grid place-items-center font-mono"
      style={{ background: "var(--parchment-deep)", fontSize: 10, letterSpacing: "0.22em", color: "var(--ink-soft)" }}
    >
      LOADING TERRAIN…
    </div>
  ),
});

function searchSpecies(q: string): SpeciesHit[] {
  return searchCatalog({ query: q, limit: 5 }).flatMap((h) => {
    const route = speciesRoute(h.id);
    return route ? [{ id: h.id, common: h.common, scientific: h.scientific, href: route.href, findable: FINDABLE_IDS.has(h.id) }] : [];
  });
}

const PROFILE_BY_ID = new Map(FINDABLE_PROFILES.map((p) => [p.id, p]));
const STATUS_RANK = { peak: 0, in: 1, out: 2 } as const;
/** Phone peek of the Find sheet (matches --kp-find-peek in keeper.css). */
const FIND_PEEK = 0.52;
/** A stored result this fresh is shown as-is instead of re-running (e.g. straight from Ask). */
const FIND_REUSE_MS = 60 * 60 * 1000;

const WATER_BY_SLUG = new Map(FISH_WATERS.map((w) => [w.slug, w]));
const SAFE_TO_SUGGEST = new Set(["choice", "edible", "edible-with-caution", "edible-when-cooked"]);
/** Minimum peek of the phone trip card as a fraction of the viewport (TripCard reports the real value). */
const PEEK = 0.46;

function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

function useViewportHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

/** "rain Tue" / "rain today" / "dry week" from the daily forecast (≥1 mm counts as rain). */
function nextRain(weather: DailyWeather[], today: string): string {
  const day = weather.find((d) => d.time >= today && d.precipitation >= 1);
  if (!day) return "dry week";
  return day.time === today ? "rain today" : `rain ${dayjs(day.time).format("ddd")}`;
}

function setFindParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("find", id);
  else url.searchParams.delete("find");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

function setSpotParam(slug: string | null) {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set("spot", slug);
  else url.searchParams.delete("spot");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export default function HomePage() {
  const { lat, lon, label, weather, elevationM, loading, setLocation } = useLocation();
  const { filterTerms } = useRegion();
  const { elevation: elevUnit } = useUnits();
  const isDesktop = useMedia("(min-width: 1024px)");
  const sheetBeside = useMedia("(min-width: 768px)");
  const vh = useViewportHeight();
  // Device-local date that rolls over on resume / at midnight; drives the kicker and today's weather.
  const todayIso = useLocalToday();

  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetSlug, setSheetSlug] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<Line | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const { spots: savedSpots, add: addSpot, remove: removeSpot } = useSavedSpots();
  /** The card over the map: a freshly dropped pin (offers Save) or a tapped saved spot (offers Remove). */
  const [pinCard, setPinCard] = useState<{ type: "pin"; lon: number; lat: number } | { type: "saved"; id: string } | null>(null);
  const [peekPx, setPeekPx] = useState<number | null>(null);
  // Forage Finder: the Find sheet replaces the trip card while open.
  const [find, setFind] = useState<{ id: string | null; radiusKm: number } | null>(null);
  const [findExpanded, setFindExpanded] = useState(false);
  const [findSel, setFindSel] = useState<number | null>(null);
  const [camera, setCamera] = useState<FieldMapProps["camera"]>(null);
  const finder = useForageFind(FINDABLE_PROFILES, todayIso);
  const month = Number(todayIso.slice(5, 7));

  // The map home doesn't scroll; the card scrolls inside itself.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  const openWater = useCallback((slug: string) => {
    const w = WATER_BY_SLUG.get(slug);
    if (!w) return;
    setSpotlight(null);
    setSheetSlug(slug);
    setFocus([w.lon, w.lat]);
    setSpotParam(slug);
  }, []);

  // Deep link: /?spot=<slug> opens that water's rules, /?find=<species id> the Find sheet. Unknown ids are ignored.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const fLat = Number(qs.get("lat"));
    const fLon = Number(qs.get("lon"));
    if (qs.has("lat") && qs.has("lon") && Number.isFinite(fLat) && Number.isFinite(fLon)) setFocus([fLon, fLat]);
    const slug = qs.get("spot");
    if (slug && WATER_BY_SLUG.has(slug)) openWater(slug);
    else if (slug) setSpotParam(null);
    const fid = qs.get("find");
    if (fid && FINDABLE_IDS.has(fid)) {
      setFind({ id: fid, radiusKm: DEFAULT_RADIUS_KM });
    } else if (fid) setFindParam(null);
  }, [openWater]);

  const closeSheet = useCallback(() => {
    setSheetSlug(null);
    setSpotlight(null);
    setSpotParam(null);
  }, []);

  const reading = useMemo(() => (weather.length ? computeSporeScore(weather) : null), [weather]);
  const picks = useMemo<ForagePick[]>(
    () =>
      reading
        ? suggestSpeciesList(reading, filterTerms, 80)
            .filter((s) => SAFE_TO_SUGGEST.has(s.edibility))
            .slice(0, 3)
            .map((s) => ({ id: s.id, name: s.commonNames[0] }))
        : [],
    [reading, filterTerms],
  );
  const pickerItems = useMemo<PickerItem[]>(
    () =>
      FINDABLE_PROFILES.map((p) => ({
        id: p.id,
        name: p.name,
        scientific: p.scientific,
        months: monthsText(p.months),
        status: seasonStatus(p, month),
        west: p.westRelevant,
      }))
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || Number(b.west) - Number(a.west) || a.name.localeCompare(b.name))
        .map(({ west: _w, ...rest }) => rest),
    [month],
  );

  const openFind = useCallback(
    (id?: string | null) => {
      const fallback =
        picks.find((p) => FINDABLE_IDS.has(p.id))?.id ?? inSeasonNow(FINDABLE_PROFILES, month, 1)[0]?.id ?? null;
      const next = id && FINDABLE_IDS.has(id) ? id : fallback;
      setSearchOpen(false);
      setPinCard(null);
      setSheetSlug(null);
      setSpotlight(null);
      setSpotParam(null);
      setFindSel(null);
      setFindExpanded(false);
      setFind((f) => ({ id: next, radiusKm: f?.radiusKm ?? DEFAULT_RADIUS_KM }));
      setFindParam(next);
    },
    [picks, month],
  );
  const closeFind = useCallback(() => {
    setFind(null);
    setFindSel(null);
    finder.reset();
    setFindParam(null);
  }, [finder]);

  // Run (or re-run) the search when the species, radius or location changes.
  const findProfile = find?.id ? PROFILE_BY_ID.get(find.id) ?? null : null;
  const { run: runFind, showStored } = finder;
  const startFind = useCallback(
    (allowStored: boolean) => {
      if (!findProfile || lat == null || lon == null || !find) return;
      const req = { profile: findProfile, center: { lat, lon, label: label || undefined }, radiusKm: find.radiusKm };
      setFindSel(null);
      if (allowStored && showStored(req, FIND_REUSE_MS)) return;
      runFind(req);
    },
    [findProfile, lat, lon, label, find, runFind, showStored],
  );
  useEffect(() => {
    startFind(true);
  }, [findProfile?.id, find?.radiusKm, lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const findResult: FindResult | null = finder.state.kind === "done" ? finder.state.result : null;
  useEffect(() => {
    if (!findResult?.spots.length) return;
    let w = findResult.center.lon, e = w, s = findResult.center.lat, n = s;
    for (const p of findResult.spots) {
      w = Math.min(w, p.lon);
      e = Math.max(e, p.lon);
      s = Math.min(s, p.lat);
      n = Math.max(n, p.lat);
    }
    setCamera({ key: `fit-${findResult.at}`, bounds: [[w, s], [e, n]] });
  }, [findResult]);
  const findPins = useMemo(() => (find && findResult ? findResult.spots.map((p) => ({ rank: p.rank, lat: p.lat, lon: p.lon })) : []), [find, findResult]);
  const findCircle = useMemo(
    () => (find && lat != null && lon != null ? { lat: findResult?.center.lat ?? lat, lon: findResult?.center.lon ?? lon, radiusKm: findResult?.radiusKm ?? find.radiusKm } : null),
    [find, lat, lon, findResult],
  );
  const selectFindSpot = (rank: number, fromMap = false) => {
    const sp = findResult?.spots.find((x) => x.rank === rank);
    if (!sp) return;
    setFindSel(rank);
    if (fromMap) {
      document.querySelector(`[data-find-rank="${rank}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      setCamera({ key: `sel-${rank}-${Date.now()}`, center: [sp.lon, sp.lat], zoom: 13.5 });
      setFindExpanded(false);
    }
  };
  const isFindSaved = (sp: FoundSpot) => savedSpots.some((x) => haversineKm(x, sp) < 0.03);
  const saveFindSpot = (sp: FoundSpot, r: FindResult) => {
    if (isFindSaved(sp)) return;
    addSpot({ lon: sp.lon, lat: sp.lat, kind: "forage", label: `${r.speciesName} · ${sp.label}` });
  };
  const logFind = (sp: FoundSpot, r: FindResult) => {
    try {
      localStorage.setItem(
        JOURNAL_DRAFT_KEY,
        JSON.stringify({
          species: r.speciesName,
          lat: sp.lat,
          lon: sp.lon,
          notes: `Forage Finder spot ${sp.rank} (${sp.label}, score ${sp.score}): ${sp.reasons.filter((x) => x.good).map((x) => x.text).join("; ")}`,
        }),
      );
    } catch {}
    router.push("/journal");
  };

  const fishRows = useNearbyFish(lat, lon);
  const hasLocation = lat != null && lon != null;
  // Fish clause only from settled rows: held back while any water loads; unloadable rows count as unknown.
  const settled = settledFishStatuses(fishRows);
  const headline = !hasLocation
    ? tripHeadline(null, [])
    : (settled === null || loading) && !reading
      ? "Checking today’s conditions…"
      : tripHeadline(reading, settled ?? [], label);
  const kicker = `Today's trip · ${dayjs(todayIso).format("ddd D MMM")}`.toUpperCase();

  const forageSpots = useMemo(
    () => (hasLocation ? [{ id: "pin", lon: lon!, lat: lat!, label: label || "Pin" }] : []),
    [hasLocation, lat, lon, label],
  );
  const savedMarkers = useMemo(() => savedSpots.map((s) => ({ id: s.id, lon: s.lon, lat: s.lat, label: s.label })), [savedSpots]);
  const cardSpot = pinCard?.type === "saved" ? savedSpots.find((s) => s.id === pinCard.id) : undefined;
  const saveCurrentPin = (lon: number, lat: number, kind: SpotKind) => {
    const near = nearestWaters(lat, lon, 1, 0.25)[0];
    const spot = addSpot({ lon, lat, kind, label: near ? `${near.name} spot` : `Spot ${lat.toFixed(3)}, ${lon.toFixed(3)}` });
    setPinCard({ type: "saved", id: spot.id });
  };
  const center: [number, number] = focus ?? [lon ?? -120.18, lat ?? 39.33];
  const padding = useMemo(
    () =>
      isDesktop
        ? { right: sheetSlug ? 420 : 0 }
        : {
            top: 110,
            bottom: find ? Math.round(vh * FIND_PEEK) : (peekPx ?? Math.round(vh * PEEK)),
            right: sheetSlug && sheetBeside ? 420 : 0,
          },
    [isDesktop, sheetBeside, sheetSlug, vh, peekPx, find],
  );

  const today = weather.find((d) => d.time === todayIso);
  const elevText =
    elevationM == null
      ? null
      : elevUnit === "ft"
        ? `${Math.round(elevationM * 3.28084).toLocaleString("en-US")} ft`
        : `${Math.round(elevationM).toLocaleString("en-US")} m`;

  const chipRow = (
    <div className="kp kp-home-bar">
      <LocationChooser
        className="relative flex-1 min-w-0"
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        renderTrigger={({ open, toggle }) => (
          <button type="button" className="kp-loc-chip" aria-expanded={open} onClick={toggle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--kp-amber-ink)" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span className="kp-loc-name">
              {hasLocation ? (label || "Unnamed spot") : loading ? "Loading…" : "Set a location"}
              {elevText && <span className="kp-loc-elev"> · {elevText}</span>}
            </span>
            {today && (
              <span className="kp-loc-wx">
                {Math.round(today.tempMax)}° · {nextRain(weather, todayIso)}
              </span>
            )}
          </button>
        )}
      />
      <button
        type="button"
        className="kp-search-btn"
        aria-label="Search"
        onClick={() => setSearchOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </button>
    </div>
  );

  const planWithAI = () => {
    setExpanded(true);
    // Wait for the sheet to snap open (and the detail to become interactive) before scrolling.
    setTimeout(() => document.getElementById("spot-finder")?.scrollIntoView({ behavior: "smooth", block: "start" }), 450);
  };

  return (
    <main className="kp-home">
      <div className="kp-home-map">
        <FieldMap
          center={center}
          base="satellite"
          overlays={NO_OVERLAYS}
          forageSpots={forageSpots}
          waters={FISH_WATERS}
          spotlightLine={spotlight}
          onWaterTap={openWater}
          savedSpots={savedMarkers}
          onSpotTap={() => {}}
          onSavedSpotTap={(id) => {
            const sp = savedSpots.find((x) => x.id === id);
            if (!sp) return;
            setFocus([sp.lon, sp.lat]);
            setPinCard({ type: "saved", id });
          }}
          onLocate={(lo, la) => {
            // GPS fix: the trip card (nearest waters, stamps, forecast) follows, like a picked location.
            setFocus(null);
            setPinCard(null);
            setLocation(la, lo, `My location (${la.toFixed(2)}°N)`);
          }}
          onLongPress={(lo, la) => {
            setFocus(null);
            setLocation(la, lo, `Pin ${la.toFixed(2)}, ${lo.toFixed(2)}`);
            setPinCard({ type: "pin", lon: lo, lat: la });
          }}
          padding={padding}
          findPins={findPins}
          findSelected={findSel}
          findCircle={findCircle}
          onFindPinTap={(rank) => selectFindSpot(rank, true)}
          camera={camera}
        />
      </div>

      {!isDesktop && chipRow}

      {find ? (
        <FindSheet
          species={pickerItems.find((p) => p.id === find.id) ?? null}
          pickerItems={pickerItems}
          radiusKm={find.radiusKm}
          radii={RADII_KM}
          onSpecies={(id) => {
            setFind((f) => (f ? { ...f, id } : f));
            setFindParam(id);
          }}
          onRadius={(km) => setFind((f) => (f ? { ...f, radiusKm: km } : f))}
          state={finder.state}
          hasLocation={hasLocation}
          locationLabel={label || "your pin"}
          onSetLocation={() => setChooserOpen(true)}
          onCancel={finder.cancel}
          onRetry={() => startFind(false)}
          onClose={closeFind}
          selectedRank={findSel}
          onSelect={(rank) => selectFindSpot(rank)}
          isSaved={isFindSaved}
          onSave={saveFindSpot}
          onLogFind={logFind}
          elevUnit={elevUnit}
          expanded={findExpanded}
          onExpandedChange={setFindExpanded}
          header={isDesktop ? chipRow : undefined}
        />
      ) : (
      <TripCard
        kicker={kicker}
        headline={headline}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onPlan={planWithAI}
        onPeekChange={setPeekPx}
        header={isDesktop ? chipRow : undefined}
        forage={<ForageHalf reading={reading} loading={loading} picks={picks} onFind={() => openFind()} />}
        fish={
          <FishHalf
            rows={fishRows}
            lat={lat}
            lon={lon}
            hasLocation={hasLocation}
            onSetLocation={() => setChooserOpen(true)}
            onWaterTap={openWater}
          />
        }
      >
        <TodayDetail reading={reading} />
      </TripCard>
      )}

      {pinCard && (pinCard.type === "pin" || cardSpot) && (
        <div className="kp kp-pin-card" role="dialog" aria-label={pinCard.type === "pin" ? "Dropped pin" : "Saved spot"}>
          <div className="kp-pin-text">
            <div className="kp-pin-title">
              {pinCard.type === "pin" ? "Pin dropped" : cardSpot!.label}
            </div>
            <div className="kp-pin-sub">
              {pinCard.type === "pin"
                ? `${pinCard.lat.toFixed(4)}, ${pinCard.lon.toFixed(4)}`
                : `Saved spot · ${cardSpot!.kind === "both" ? "forage + fish" : cardSpot!.kind}`}
            </div>
          </div>
          {pinCard.type === "pin" ? (
            <button type="button" className="kp-pin-btn kp-pin-btn-primary" onClick={() => saveCurrentPin(pinCard.lon, pinCard.lat, defaultSpotKind(pinCard.lat, pinCard.lon))}>
              Save spot
            </button>
          ) : (
            <button
              type="button"
              className="kp-pin-btn"
              onClick={() => {
                removeSpot(cardSpot!.id);
                setPinCard(null);
              }}
            >
              Remove
            </button>
          )}
          <button type="button" className="kp-pin-btn kp-pin-x" aria-label="Dismiss" onClick={() => setPinCard(null)}>
            ×
          </button>
        </div>
      )}

      {searchOpen && (
        <UnifiedSearch
          searchSpecies={searchSpecies}
          onClose={() => setSearchOpen(false)}
          onOpenWater={(slug) => {
            setSearchOpen(false);
            openWater(slug);
          }}
          onOpenSpecies={(hit) => router.push(hit.href)}
          onFindSpecies={(hit) => openFind(hit.id)}
          onChangeLocation={() => {
            setSearchOpen(false);
            setChooserOpen(true);
          }}
        />
      )}

      {sheetSlug && <RulesSheet key={sheetSlug} slug={sheetSlug} onClose={closeSheet} onSpotlight={setSpotlight} />}
    </main>
  );
}
