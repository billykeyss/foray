import { resolveDataset } from "./resolve.ts";
import type { Scope, ScopeStatus, SerializedRule } from "./engine/index.ts";
import type { WaterDataset } from "./types.ts";

export interface CatchInput {
  species?: string;
  length_in?: number;
  kept: boolean;
}

export interface CatchWarning {
  text: string;
  citation: string | null;
  sourceUrl: string | null;
  confidence?: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const GENERIC = new Set(["bass", "trout", "salmon", "the", "and", "x"]);
const BLACK_BASS = ["largemouth", "smallmouth", "spotted"];

/** Does a rule's species target cover the caught species? Loose on purpose: these are hints. */
function targets(ruleSpecies: string[], caught: string): boolean {
  if (ruleSpecies.length === 0) return true;
  const c = norm(caught);
  if (!c) return false;
  const cTokens = c.split(/[^a-z]+/).filter((t) => t && !GENERIC.has(t));
  return ruleSpecies.some((raw) => {
    const r = norm(raw);
    const base = r.replace(/\s*\(.*$/, "");
    if (r.includes(c) || c.includes(base)) return true;
    if (r.includes("black bass") && BLACK_BASS.some((b) => c.includes(b))) return true;
    return cTokens.some((t) => r.split(/[^a-z]+/).includes(t));
  });
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const MISSING_HINT = "Add species and length to check size limits";

/** The rule that set a scope's catch-and-release / closed status, for its citation and confidence. */
function statusRule(rules: SerializedRule[], status: ScopeStatus): SerializedRule | undefined {
  const cr = (r: SerializedRule) => r.detail.catch_and_release === true;
  const closedish = (r: SerializedRule) =>
    r.ruleType === "closure" || r.periods?.some((p) => p.activeNow && p.status === "closed");
  const pick = status === "closed" ? closedish : cr;
  return rules.find(pick) ?? rules.find((r) => r.ruleType === "bag" || r.ruleType === "season" || r.ruleType === "closure") ?? rules[0];
}

function statusWarning(status: ScopeStatus | undefined, rules: SerializedRule[], text: { cr: string; closed: string }): CatchWarning[] {
  if (status !== "closed" && status !== "catch_and_release") return [];
  const r = statusRule(rules, status);
  return [{ text: status === "closed" ? text.closed : text.cr, citation: r?.citation ?? null, sourceUrl: r?.sourceUrl ?? null, confidence: r?.confidence ?? null }];
}

function sizeWarnings(c: CatchInput, rules: SerializedRule[], where: string): CatchWarning[] {
  const out: CatchWarning[] = [];
  if (c.length_in == null || !Number.isFinite(c.length_in) || !c.species?.trim()) return out;
  for (const r of rules) {
    if (r.ruleType !== "size_limit" || r.polarity === "asserts_none") continue;
    if (!targets(r.species, c.species)) continue;
    const min = num(r.detail.min_length_in);
    const max = num(r.detail.max_length_in);
    const base = { citation: r.citation, sourceUrl: r.sourceUrl, confidence: r.confidence };
    if (min !== null && c.length_in < min) out.push({ text: `Under the ${min} in minimum ${where}`, ...base });
    else if (max !== null && c.length_in > max) out.push({ text: `Over the ${max} in maximum ${where}`, ...base });
  }
  return out;
}

const missing = (c: CatchInput) => c.length_in == null || !Number.isFinite(c.length_in) || !c.species?.trim();
const hint = (): CatchWarning => ({ text: MISSING_HINT, citation: null, sourceUrl: null });

/**
 * Hints for a logged catch, never legal advice. Only a kept fish warns. Considers `size_limit`
 * rules targeting the catch species (or all species) and the water's status for the date.
 * `rules` are the rules in force; status warnings take their citation from them.
 */
export function catchWarnings(c: CatchInput, rules: SerializedRule[], status?: ScopeStatus): CatchWarning[] {
  if (!c.kept) return [];
  return [
    ...statusWarning(status, rules, { cr: "This water is catch & release only today", closed: "This water is closed today" }),
    ...sizeWarnings(c, rules, "here"),
    ...(missing(c) ? [hint()] : []),
  ];
}

export interface CatchCheck {
  warnings: CatchWarning[];
  status: ScopeStatus;
  dataAsOf: string;
}

/**
 * Resolve a water's dataset for the catch's local date and check the catch against every scope
 * (water-wide and each reach). With `reachId` only the water scope and that reach apply; without
 * it every reach applies and its warnings name the reach.
 */
export function checkCatch(ds: WaterDataset, c: CatchInput, date: string, reachId?: string | null): CatchCheck {
  const r = resolveDataset(ds, date);
  const out: CatchWarning[] = [];
  if (c.kept) {
    for (const sc of r.scopes as Scope[]) {
      if (sc.kind === "reach" && reachId && sc.reachId !== reachId) continue;
      const wide = sc.kind === "water" || !!reachId;
      const name = sc.scope;
      out.push(
        ...statusWarning(sc.status, sc.rules, {
          cr: sc.kind === "water" ? "This water is catch & release only today" : wide ? "This reach is catch & release only today" : `Catch & release only on ${name}`,
          closed: sc.kind === "water" ? "This water is closed today" : wide ? "This reach is closed today" : `Closed on ${name}`,
        }),
        ...sizeWarnings(c, sc.rules, wide ? "here" : `on ${name}`),
      );
    }
    if (missing(c)) out.push(hint());
  }
  return { warnings: out, status: r.status.overall, dataAsOf: r.dataAsOf };
}
