"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadWater, WaterNotCachedError, WaterNotFoundError } from "@/lib/fishing/load.ts";
import { resolveDataset, type WaterRules } from "@/lib/fishing/resolve.ts";
import { localIsoDate } from "@/lib/fishing/local-date.ts";
import { StatusStamp } from "./status-stamp";
import { RuleCard, SpeciesLimitCard } from "./rule-card";
import { groupBagAndSize } from "./rule-format.ts";
import { StockingSection } from "./stocking-section";
import { WarnIcon, RetryIcon, CloseIcon, ExternalIcon } from "./icons";

export type Line = [number, number][];

export type WaterState =
  | { kind: "loading" }
  | { kind: "ready"; data: WaterRules }
  | { kind: "not-cached" }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/** Load + resolve a water for `on` (default: the device's local today). `reload` retries. */
export function useWaterRules(slug: string, on?: string) {
  const [state, setState] = useState<WaterState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    loadWater(slug)
      .then((ds) => {
        if (!cancelled) setState({ kind: "ready", data: resolveDataset(ds, on ?? localIsoDate()) });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof WaterNotCachedError) setState({ kind: "not-cached" });
        else if (err instanceof WaterNotFoundError) setState({ kind: "not-found" });
        else setState({ kind: "error", message: err instanceof Error ? err.message : "Unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, on, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}

const WATER_TYPE_LABEL: Record<string, string> = {
  lake: "Lake", reservoir: "Reservoir", river: "River", stream: "Stream", creek: "Creek",
  pond: "Pond", marina: "Marina", impoundment: "Impoundment",
};

function splitExtent(sublabel: string): [string, string] | null {
  const parts = sublabel.split(" → ");
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
}

/** "Rules not downloaded", "Water not found" etc. for non-ready states. */
export function WaterStateNotice({ state, onRetry }: { state: WaterState; onRetry: () => void }) {
  if (state.kind === "loading") {
    return (
      <div className="skeleton" aria-hidden="true">
        <div className="sk-line sk-lg" />
        <div className="sk-card" />
        <div className="sk-card" />
      </div>
    );
  }
  if (state.kind === "ready") return null;
  const msg =
    state.kind === "not-cached"
      ? "Rules not downloaded — connect once to save them"
      : state.kind === "not-found"
        ? "Water not found"
        : "Couldn’t load regulations.";
  return (
    <div className="sheet-error" role="alert">
      <p>{msg}</p>
      {state.kind !== "not-found" && (
        <button className="btn-retry" onClick={onRetry}>
          <RetryIcon size={15} /> Retry
        </button>
      )}
    </div>
  );
}

function conditionText(c: Record<string, unknown> | null): string | null {
  if (!c) return null;
  const parts = Object.entries(c)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => {
      const key = k.replace(/_/g, " ");
      if (typeof v === "boolean") return v ? key : `not ${key}`;
      if (typeof v === "string" || typeof v === "number") return `${key}: ${v}`;
      return `${key}: ${JSON.stringify(v)}`;
    });
  return parts.length ? parts.join("; ") : null;
}

/** Title, stamp, type/state chips and the verify banner. */
export function WaterHeader({ data, thunk }: { data: WaterRules; thunk?: boolean }) {
  const { water, status } = data;
  return (
    <>
      <div className="sheet-header">
        <h2 className="sheet-title">{water.name}</h2>
        <div className="sheet-meta">
          <StatusStamp status={status.overall} thunk={thunk} key={water.slug} />
          <span className="chip chip--type">{WATER_TYPE_LABEL[water.waterType] ?? water.waterType}</span>
          {water.states.map((s) => (
            <span className="chip chip--state" key={s}>{s}</span>
          ))}
        </div>
      </div>
      {status.verifyCurrent && (
        <div className="verify-banner" role="note">
          <WarnIcon size={17} />
          <span>
            <span className="advisory-tag">Advisory</span>
            Verify current conditions with the managing agency.
          </span>
        </div>
      )}
    </>
  );
}

/** The shared body: scopes, licenses, reciprocity, species, stocking, citations footer. */
export function WaterRulesBody({
  data,
  selectedReachId,
  onShowOnMap,
}: {
  data: WaterRules;
  selectedReachId: string | null;
  onShowOnMap?: (reachId: string, line: Line) => void;
}) {
  const reachCount = data.scopes.filter((s) => s.kind === "reach").length;
  let reachNum = 0;
  const licenseSource = data.licenses.find((l) => l.sourceUrl)?.sourceUrl;
  return (
    <div className="stagger">
      {data.scopes.map((scope, i) => {
        const isReach = scope.kind === "reach";
        const n = isReach ? ++reachNum : 0;
        const extent = isReach && scope.sublabel ? splitExtent(scope.sublabel) : null;
        const hasLine = !!scope.line && scope.line.length > 0;
        const selectable = isReach && scope.reachId != null && hasLine && !!onShowOnMap;
        const isSelected = selectable && scope.reachId === selectedReachId;
        const titles = (
          <div className="scope-titles">
            {isReach ? (
              <>
                <span className="reach-overline">Section {n} of {reachCount}</span>
                <span className="scope-name reach-title">
                  {extent ? (
                    <>
                      <span className="reach-endpoint">{extent[0]}</span>
                      <span className="reach-arrow" aria-hidden="true">→</span>
                      <span className="reach-endpoint">{extent[1]}</span>
                    </>
                  ) : (
                    scope.sublabel ?? scope.scope
                  )}
                </span>
              </>
            ) : (
              <h3 className="scope-name">This water</h3>
            )}
          </div>
        );
        return (
          <Fragment key={`${scope.kind}:${scope.scope}:${i}`}>
            {isReach && n === 1 && reachCount > 1 && (
              <p className="scope-overview">
                This water is split into <strong>{reachCount}</strong> regulated sections
                {onShowOnMap ? " — tap a section to highlight it on the map." : "."}
              </p>
            )}
            <section
              className={`scope${isReach ? " scope--reach" : " scope--water"}`}
              data-scope={scope.scope}
              data-selected={isSelected || undefined}
            >
              {selectable ? (
                <button
                  type="button"
                  className="scope-head reach-head"
                  aria-pressed={isSelected}
                  onClick={() => onShowOnMap!(scope.reachId!, scope.line!)}
                >
                  {titles}
                  <span className="reach-head-right">
                    <StatusStamp status={scope.status} size="sm" />
                    <span className="reach-map-cue">{isSelected ? "On map ✓" : "Show on map"}</span>
                  </span>
                </button>
              ) : (
                <div className="scope-head">
                  {titles}
                  <StatusStamp status={scope.status} size="sm" />
                </div>
              )}
              {scope.rules.length === 0 ? (
                <p className="scope-empty">No specific rules recorded for this scope.</p>
              ) : (
                <div className="rule-list">
                  {groupBagAndSize(scope.rules).map((item, j) =>
                    item.kind === "merged" ? (
                      <SpeciesLimitCard species={item.species} bag={item.bag} size={item.size} key={j} />
                    ) : (
                      <RuleCard rule={item.rule} key={j} />
                    ),
                  )}
                </div>
              )}
            </section>
          </Fragment>
        );
      })}

      {data.licenses.length > 0 && (
        <section className="scope">
          <div className="scope-head"><h3 className="scope-name">Licenses &amp; permits</h3></div>
          <div className="rule-list">
            {data.licenses.map((l, i) => (
              <div key={i}>
                {l.authority && <p className="license-authority">{l.authority}</p>}
                <RuleCard rule={l} />
              </div>
            ))}
          </div>
        </section>
      )}

      {data.reciprocity.length > 0 && (
        <section className="scope">
          <div className="scope-head"><h3 className="scope-name">License reciprocity</h3></div>
          <ul className="recip-list">
            {data.reciprocity.map((r, i) => {
              const cond = conditionText(r.condition);
              return (
                <li key={i} className="recip-row">
                  <span className={`recip-dot ${r.honored ? "yes" : "no"}`} aria-hidden="true" />
                  <span>
                    {r.honoringAuthority} {r.honored ? "honors" : "does not honor"} {r.honoredAuthority ?? "other licenses"}
                    {r.replacesStateLicense ? " — replaces the state license here." : "."}
                    {cond && <span className="recip-cond">{cond}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.species.length > 0 && (
        <section className="scope">
          <div className="scope-head"><h3 className="scope-name">Species at this water</h3></div>
          <div className="species-chips">
            {data.species.map((s, i) => (
              <span className="species-chip" key={i} title={s.scientificName ?? undefined}>
                {s.commonName}
                <span className="species-presence">{s.presence}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <StockingSection events={data.stocking.events} schedule={data.stocking.schedule} />

      <footer className="sheet-foot">
        Rules resolved for <span className="asof">{data.asOf}</span>; data as of{" "}
        <span className="asof">{data.dataAsOf}</span>. Each rule lists its citation and source link.
        {licenseSource && (
          <>
            {" "}
            <a href={licenseSource} target="_blank" rel="noreferrer noopener">
              Official source <ExternalIcon />
            </a>
          </>
        )}
        <span className="legal">A convenience summary, not legal advice — confirm with the managing agency.</span>
      </footer>
    </div>
  );
}

interface Props {
  slug: string;
  onClose: () => void;
  /** Highlight a reach's line on the map; called with null to clear the highlight. */
  onSpotlight: (line: Line | null) => void;
  /** Resolve for this YYYY-MM-DD instead of today (dev/testing). */
  on?: string;
}

export function RulesSheet({ slug, onClose, onSpotlight, on }: Props) {
  const { state, reload } = useWaterRules(slug, on);
  const [mode, setMode] = useState<"peek" | "expanded">("expanded");
  const [selectedReach, setSelectedReach] = useState<string | null>(null);
  // Starts false so SSR and first client render match; the effect below corrects it.
  const [isDesktop, setIsDesktop] = useState(false);
  const [peekOffset, setPeekOffset] = useState(0);
  const peekRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // New water: clear the previous highlight and reset the sheet.
  useEffect(() => {
    setSelectedReach(null);
    setMode("expanded");
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const measure = () => {
      const h = sheetRef.current?.offsetHeight ?? 0;
      const hh = peekRef.current?.offsetHeight ?? 148;
      // 16: sheet border, stamp tilt and breathing room below the header
      setPeekOffset(Math.max(0, h - hh - 16));
    };
    measure();
    window.addEventListener("resize", measure);
    // Fonts and the stamp load after first paint and change the header height.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (peekRef.current) ro?.observe(peekRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [state, isDesktop]);

  const showOnMap = useCallback(
    (reachId: string, line: Line) => {
      const clear = selectedReach === reachId;
      setSelectedReach(clear ? null : reachId);
      onSpotlight(clear ? null : line);
      // On mobile the expanded sheet covers the map: drop to peek so the highlight is visible.
      if (!clear && !isDesktop) setMode("peek");
    },
    [selectedReach, onSpotlight, isDesktop],
  );

  const ready = state.kind === "ready" ? state.data : null;
  const name = ready?.water.name ?? "";
  const translate = isDesktop ? undefined : { transform: `translateY(${mode === "peek" ? peekOffset : 0}px)` };

  return (
    <div className="kp">
      {!isDesktop && mode === "expanded" && <div className="scrim" onClick={onClose} aria-hidden="true" />}
      <section
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="false"
        aria-label={name ? `${name} regulations` : "Water regulations"}
        data-open="true"
        data-mode={mode}
        style={translate}
      >
        <button className="sheet-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
        <div className="sheet-peek" ref={peekRef}>
          <div className="sheet-grab">
            <button
              className="sheet-handle"
              aria-label={mode === "expanded" ? "Collapse details" : "Expand details"}
              aria-expanded={mode === "expanded"}
              onClick={() => setMode((m) => (m === "expanded" ? "peek" : "expanded"))}
            />
          </div>
          {ready ? (
            <WaterHeader data={ready} thunk />
          ) : (
            <div className="sheet-header">
              <span className="pill-loading">{state.kind === "loading" ? "Checking…" : ""}</span>
            </div>
          )}
        </div>
        <div className="sheet-body">
          {ready ? (
            <WaterRulesBody data={ready} selectedReachId={selectedReach} onShowOnMap={showOnMap} />
          ) : (
            <WaterStateNotice state={state} onRetry={reload} />
          )}
        </div>
      </section>
    </div>
  );
}
