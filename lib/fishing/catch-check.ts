import { resolveDataset } from "./resolve.ts";
import type { ScopeStatus, SerializedRule } from "./engine/index.ts";
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

/**
 * Hints for a logged catch, never legal advice. Only a kept fish warns. Considers `size_limit`
 * rules targeting the catch species (or all species) and the water's status for the date.
 */
export function catchWarnings(c: CatchInput, rules: SerializedRule[], status?: ScopeStatus): CatchWarning[] {
  if (!c.kept) return [];
  const out: CatchWarning[] = [];
  if (status === "closed") out.push({ text: "This water is closed today", citation: null, sourceUrl: null });
  else if (status === "catch_and_release")
    out.push({ text: "This water is catch & release only today", citation: null, sourceUrl: null });

  if (c.length_in == null || !Number.isFinite(c.length_in) || !c.species?.trim()) return out;
  for (const r of rules) {
    if (r.ruleType !== "size_limit" || r.polarity === "asserts_none") continue;
    if (!targets(r.species, c.species)) continue;
    const min = num(r.detail.min_length_in);
    const max = num(r.detail.max_length_in);
    if (min !== null && c.length_in < min)
      out.push({ text: `Under the ${min} in minimum here`, citation: r.citation, sourceUrl: r.sourceUrl });
    else if (max !== null && c.length_in > max)
      out.push({ text: `Over the ${max} in maximum here`, citation: r.citation, sourceUrl: r.sourceUrl });
  }
  return out;
}

export interface CatchCheck {
  warnings: CatchWarning[];
  status: ScopeStatus;
  confidence: string | null;
  dataAsOf: string;
}

/** Resolve a water's dataset for the catch's local date and check the catch against it.
 *  Uses water-wide rules only (reach-specific rules are not assumed to apply). */
export function checkCatch(ds: WaterDataset, c: CatchInput, date: string): CatchCheck {
  const r = resolveDataset(ds, date);
  const rules = r.scopes.filter((s) => s.kind === "water").flatMap((s) => s.rules);
  const warnings = catchWarnings(c, rules, r.status.overall);
  return { warnings, status: r.status.overall, confidence: rules.find((x) => x.ruleType === "size_limit")?.confidence ?? null, dataAsOf: r.dataAsOf };
}
