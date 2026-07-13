"use client";

import { useEffect, useState } from "react";
import { useApiKey } from "@/lib/api-key-context";
import { useLocation } from "@/lib/location-context";
import { useRegion } from "@/lib/region-context";
import {
  analyzeSpotsWithClaude,
  scoreCandidates,
  selectCandidates,
  type AnalyzeResult,
  type CandidateSpot,
  type RankedSpot,
  type SpotFinderAuth,
} from "@/lib/spot-finder";
import ApiKeyDialog from "@/components/api-key-dialog";
import {
  probeChatProxy,
  verifyChatPassword,
  loadChatPassword,
  saveChatPassword,
  clearChatPassword,
} from "@/lib/chat/gate.ts";

type Phase = "idle" | "gathering" | "analyzing" | "done" | "error";

// Same shared gate as ChatPanel — one password unlocks both features, since
// they hit the same server-side proxy and localStorage key.
type GateState =
  | { mode: "probing" }
  | { mode: "password-locked"; error: string | null }
  | { mode: "password-ready"; password: string }
  | { mode: "byo" };

export default function SpotFinder() {
  const { hasKey, apiKey, loaded } = useApiKey();
  const { lat, lon, label, setLocation } = useLocation();
  const { def: regionDef, filterTerms } = useRegion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string>("");
  const [spots, setSpots] = useState<RankedSpot[]>([]);
  const [considered, setConsidered] = useState<CandidateSpot[]>([]);
  const [raw, setRaw] = useState<AnalyzeResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [gate, setGate] = useState<GateState>({ mode: "probing" });
  const [pwInput, setPwInput] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // Probe the Foray server's chat proxy once on mount to pick BYO vs
  // password-gated mode; re-verify a saved password before trusting it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const proxyMode = await probeChatProxy();
      if (cancelled) return;
      if (proxyMode === "byo-mode") {
        setGate({ mode: "byo" });
        return;
      }
      const saved = loadChatPassword();
      if (saved && (await verifyChatPassword(saved))) {
        if (!cancelled) setGate({ mode: "password-ready", password: saved });
      } else {
        clearChatPassword();
        if (!cancelled) setGate({ mode: "password-locked", error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function unlock(pw: string) {
    const trimmed = pw.trim();
    if (!trimmed || unlocking) return;
    setUnlocking(true);
    try {
      if (await verifyChatPassword(trimmed)) {
        saveChatPassword(trimmed);
        setGate({ mode: "password-ready", password: trimmed });
        setPwInput("");
      } else {
        setGate({ mode: "password-locked", error: "Wrong password (or rate-limited — wait a minute)." });
      }
    } finally {
      setUnlocking(false);
    }
  }

  const run = async () => {
    const auth: SpotFinderAuth | null =
      gate.mode === "password-ready"
        ? { kind: "password", password: gate.password }
        : hasKey && apiKey
          ? { kind: "byo", apiKey }
          : null;
    if (!auth || lat == null || lon == null) return;
    setError(null);
    setSpots([]);
    setConsidered([]);
    setRaw(null);
    setShowRaw(false);
    setPhase("gathering");
    try {
      const candidates = selectCandidates(lat, lon, label || "Untitled");
      setProgress(`Fetching weather for ${candidates.length} spots…`);
      const scored = await scoreCandidates(candidates);
      const viable = scored.filter((s) => s.reading != null);
      if (viable.length === 0) {
        setError("Couldn't fetch weather for any nearby spots.");
        setPhase("error");
        return;
      }
      setConsidered(viable);
      setPhase("analyzing");
      setProgress(`Asking Claude about ${viable.length} spots…`);
      const result = await analyzeSpotsWithClaude({
        auth,
        candidates: viable,
        regionLabel: regionDef.label,
        regionFilterTerms: filterTerms,
        topN: 3,
      });
      setSpots(result.spots);
      setRaw(result);
      setPhase("done");
      setProgress("");
    } catch (e) {
      const anyErr = e as { status?: number; message?: string };
      if (anyErr.status === 401 && gate.mode === "password-ready") {
        clearChatPassword();
        setGate({ mode: "password-locked", error: "Chat password no longer valid — enter it again." });
      }
      setError(anyErr.message ?? "Unknown error");
      setPhase("error");
    }
  };

  if (!loaded) return null;

  return (
    <section
      className="mt-10 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(125, 80, 40, 0.08), rgba(60, 90, 60, 0.06))",
        border: "1px solid var(--line)",
        borderRadius: 22,
        padding: "22px 22px 20px",
      }}
    >
      <div className="flex justify-between items-start gap-3">
        <div>
          <div
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.28em",
              color: "var(--rust)",
              textTransform: "uppercase",
            }}
          >
            Claude · Spot finder
          </div>
          <h3
            className="font-display italic mt-2"
            style={{
              fontSize: 24,
              fontWeight: 350,
              lineHeight: 1.1,
              color: "var(--moss)",
              letterSpacing: "-0.01em",
            }}
          >
            Where should I go today?
          </h3>
          <p
            className="font-body mt-2"
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--ink-soft)",
              maxWidth: 460,
            }}
          >
            Pulls live weather for spots near you, ranks them with the Spore
            Score, then asks Claude to recommend the top picks with reasoning
            and species hints.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="API key settings"
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 100,
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
            color: "var(--ink-soft)",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06A2 2 0 1 1 7.04 4.29l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <div className="mt-5">
        {gate.mode === "probing" ? null : gate.mode === "password-locked" ? (
          <div>
            <form
              className="flex gap-2"
              style={{ maxWidth: 280 }}
              onSubmit={(e) => {
                e.preventDefault();
                unlock(pwInput);
              }}
            >
              <input
                type="password"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                aria-label="Chat password"
                maxLength={200}
                disabled={unlocking}
                className="font-body min-w-0 flex-1"
                style={{
                  borderRadius: 100,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  padding: "8px 14px",
                  fontSize: 13,
                  color: "var(--ink)",
                }}
              />
              <button
                type="submit"
                disabled={unlocking}
                className="btn-primary"
                style={{ width: "auto" }}
              >
                {unlocking ? "…" : "Unlock"}
              </button>
            </form>
            {gate.error && (
              <div
                className="font-body mt-2"
                style={{ fontSize: 13, color: "var(--rust-deep)" }}
              >
                {gate.error}
              </div>
            )}
            <button
              type="button"
              onClick={() => setGate({ mode: "byo" })}
              className="font-mono mt-2"
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--ink-soft)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Use your own API key instead
            </button>
          </div>
        ) : gate.mode === "byo" && !hasKey ? (
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="btn-primary"
            style={{ width: "auto" }}
          >
            Add Claude API key →
          </button>
        ) : (
          <button
            type="button"
            onClick={run}
            disabled={phase === "gathering" || phase === "analyzing"}
            className="btn-primary"
            style={{ width: "auto" }}
          >
            {phase === "gathering" || phase === "analyzing"
              ? "Working…"
              : phase === "done"
                ? "Analyze again →"
                : "Find spots near me →"}
          </button>
        )}
        {progress && (
          <div
            className="font-mono mt-3"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "var(--ink-soft)",
              textTransform: "uppercase",
              opacity: 0.8,
            }}
          >
            {progress}
          </div>
        )}
        {error && (
          <div
            className="font-body mt-3"
            style={{
              fontSize: 13,
              color: "var(--rust-deep)",
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {spots.length > 0 && (
        <ol className="mt-6 space-y-3">
          {spots.map((s) => (
            <li
              key={`${s.name}-${s.rank}`}
              style={{
                background: "rgba(240, 228, 200, 0.6)",
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: "16px 18px",
              }}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="font-display"
                    style={{
                      fontWeight: 350,
                      fontSize: 26,
                      color: "var(--rust)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                    }}
                  >
                    {s.rank}
                  </span>
                  <span
                    className="font-display italic"
                    style={{
                      fontSize: 19,
                      fontWeight: 350,
                      color: "var(--moss)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {s.name}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.14em",
                      color: "var(--ink-soft)",
                      opacity: 0.7,
                      textTransform: "uppercase",
                    }}
                  >
                    {s.distanceKm < 1
                      ? "here"
                      : `${Math.round(s.distanceKm)} km`}{" "}
                    · score {s.score}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocation(s.lat, s.lon, s.name)}
                  className="font-mono"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--moss)",
                    borderRadius: 100,
                    padding: "6px 10px",
                    fontSize: 9.5,
                    letterSpacing: "0.18em",
                    color: "var(--moss)",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    flex: "none",
                  }}
                >
                  Set →
                </button>
              </div>

              <p
                className="font-body mt-2"
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "var(--ink)",
                }}
              >
                {s.reasoning}
              </p>

              {s.likelySpecies?.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-3">
                  {s.likelySpecies.map((sp) => (
                    <span
                      key={sp.scientific}
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        color: "var(--moss)",
                        background: "rgba(44, 58, 42, 0.08)",
                        border: "1px solid var(--line)",
                        borderRadius: 100,
                        padding: "4px 10px",
                      }}
                    >
                      {sp.commonName}{" "}
                      <em
                        className="font-display italic"
                        style={{
                          color: "var(--rust)",
                          fontSize: 9.5,
                          marginLeft: 4,
                        }}
                      >
                        {sp.scientific}
                      </em>
                    </span>
                  ))}
                </div>
              )}

              {s.cautions && (
                <div
                  className="font-mono mt-3"
                  style={{
                    fontSize: 11,
                    color: "var(--rust-deep)",
                    letterSpacing: "0.04em",
                    lineHeight: 1.4,
                  }}
                >
                  ⚠ {s.cautions}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Empty result — analysis ran but Claude returned no viable spots */}
      {phase === "done" && spots.length === 0 && considered.length > 0 && (
        <div
          className="mt-6"
          style={{
            border: "1px dashed var(--line)",
            borderRadius: 14,
            padding: "18px 18px 16px",
            background: "rgba(255, 255, 255, 0.22)",
          }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.24em",
              color: "var(--ink-soft)",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            No viable spots
          </div>
          <p
            className="font-body mt-2"
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--ink)",
            }}
          >
            Claude reviewed{" "}
            <strong>{considered.length} spot{considered.length === 1 ? "" : "s"}</strong>{" "}
            within driving distance and didn't find any where current
            conditions meet a species' fruiting requirements. The whole region
            is probably in a dry pocket right now. Here's what was considered:
          </p>
          <ul className="mt-3 space-y-1">
            {[...considered]
              .sort(
                (a, b) =>
                  (b.reading?.score ?? 0) - (a.reading?.score ?? 0)
              )
              .slice(0, 8)
              .map((c) => (
                <li
                  key={`${c.name}-${c.lat}`}
                  className="flex items-baseline justify-between gap-3"
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <span
                    className="font-display italic"
                    style={{
                      fontSize: 15,
                      color: "var(--moss)",
                      fontWeight: 350,
                    }}
                  >
                    {c.name}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      color: "var(--ink-soft)",
                      flex: "none",
                    }}
                  >
                    {Math.round(c.distanceKm)} km · score{" "}
                    <strong style={{ color: "var(--moss)" }}>
                      {c.reading?.score ?? "—"}
                    </strong>{" "}
                    · {c.reading?.rain7d.toFixed(0) ?? "—"}mm
                  </span>
                </li>
              ))}
          </ul>
          <p
            className="font-body italic mt-3"
            style={{
              fontSize: 12.5,
              color: "var(--ink-soft)",
              opacity: 0.7,
              lineHeight: 1.5,
            }}
          >
            Most catalog species need 15–25mm of 7-day rain to trigger a flush.
            Check back after the next storm front.
          </p>
        </div>
      )}

      {/* Raw response inspector — for understanding/debugging the LLM call */}
      {raw && phase === "done" && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="font-mono inline-flex items-center gap-2"
            style={{
              background: "transparent",
              border: 0,
              color: "var(--rust)",
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {showRaw ? "Hide raw response" : "Show raw response"}
            <span
              style={{
                display: "inline-block",
                transform: showRaw ? "rotate(180deg)" : "none",
                transition: "transform 0.2s",
              }}
            >
              ↓
            </span>
            {raw.raw.usage && (
              <span
                style={{
                  color: "var(--ink-soft)",
                  opacity: 0.6,
                  marginLeft: 8,
                  fontSize: 9.5,
                }}
              >
                {raw.raw.usage.input_tokens}↑ /{" "}
                {raw.raw.usage.output_tokens}↓ tok
              </span>
            )}
          </button>

          {showRaw && (
            <div className="mt-3 space-y-4">
              <RawBlock
                label="Tool call · report_spots"
                json={
                  raw.raw.content.find((b) => b.type === "tool_use")?.input ??
                  null
                }
              />
              <RawBlock
                label="Full API response"
                json={raw.raw}
              />
              <RawBlock label="Prompt sent" text={raw.prompt} />
            </div>
          )}
        </div>
      )}

      <ApiKeyDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </section>
  );
}

function RawBlock({
  label,
  json,
  text,
}: {
  label: string;
  json?: unknown;
  text?: string;
}) {
  const body =
    text != null ? text : json != null ? JSON.stringify(json, null, 2) : "";
  return (
    <details
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "rgba(26, 20, 16, 0.04)",
      }}
    >
      <summary
        className="font-mono cursor-pointer"
        style={{
          padding: "10px 12px",
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "var(--ink-soft)",
          textTransform: "uppercase",
          listStyle: "none",
        }}
      >
        {label}
      </summary>
      <pre
        className="font-mono"
        style={{
          margin: 0,
          padding: "0 12px 12px",
          fontSize: 11,
          lineHeight: 1.5,
          color: "var(--ink)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 480,
          overflowY: "auto",
        }}
      >
        {body}
      </pre>
    </details>
  );
}
