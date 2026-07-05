/**
 * Coastal / intertidal foraging catalog — type definitions.
 *
 * Fourth forageable catalog (a "Tide" segment in the Guide), scoped to the
 * California + Pacific Northwest coast. Unlike the plant catalog, the dominant
 * hazard here is invisible biotoxins (PSP / domoic acid / DSP / Vibrio) and
 * harvest regulations/quarantines rather than toxic lookalikes — hence the
 * first-class `biotoxinNotes` and `regulations` fields, and the `hazard` group
 * used for the biotoxin warning cards that shellfish entries link to.
 *
 * Not extended from `Forageable` (marine entries have tidal zone + depth, not
 * elevation/family), but `regionsPNW` matches the same region-term contract, so
 * `speciesInRegions()` filters these the same way.
 */
import type { Danger, Source, Verification } from "./species-types";

export type OceanGroup =
  | "kelp"
  | "red-algae"
  | "green-algae"
  | "bivalve"
  | "crustacean"
  | "echinoderm"
  | "gastropod"
  | "hazard";

export type TidalZone = "high" | "mid" | "low" | "subtidal";

export type OceanEdibility =
  | "choice"
  | "edible"
  /** must be cooked / dried to be safe or palatable */
  | "edible-cooked"
  /** edible but with a real caveat — biotoxin advisory, regulation, water quality */
  | "edible-with-caution"
  | "inedible"
  | "toxic"
  | "deadly";

export type OceanEdiblePart =
  | "blade"
  | "frond"
  | "stipe"
  | "pneumatocyst"
  | "whole"
  | "meat"
  | "adductor"
  | "siphon"
  | "roe"
  | "legs";

export interface OceanSeasonCue {
  tempSensitive: boolean;
  notes: string | null;
}

/** Field-ID details. All optional except keyFeatures, since seaweeds
 *  (form/holdfast) and shellfish (shell) describe different things. */
export interface OceanIdentification {
  form?: string | null;
  color?: string | null;
  texture?: string | null;
  size?: string | null;
  holdfast?: string | null;
  shell?: string | null;
  keyFeatures: string[];
}

export interface OceanLookalike {
  name: string;
  scientific: string;
  danger: Danger;
  distinguishingFeature: string;
  catalogId?: string;
  keyFeatures?: string[];
}

export interface OceanCulinary {
  flavor: string;
  uses: string;
  preservation: string | null;
}

export interface OceanSpecies {
  id: string;
  commonNames: string[];
  scientific: string;
  group: OceanGroup;

  habitat: string;
  tidalZone: TidalZone;
  /** region terms matched by lib/regions.ts (coastal regions here) */
  regionsPNW: string[];

  /** months 1-12 of legal/quality harvest (empty for hazard entries) */
  harvestMonths: number[];
  peakMonths: number[];
  seasonCue: OceanSeasonCue;
  /** tide window that exposes it, e.g. "minus/spring low tides" */
  bestTide: string | null;

  edibleParts: OceanEdiblePart[];
  edibility: OceanEdibility;
  preparation: string;
  cautions: string | null;
  /** PSP / domoic acid / DSP / Vibrio exposure and what cooking does (or doesn't) */
  biotoxinNotes: string | null;
  /** license, size/bag limits, seasons/quarantine, and which advisory to check */
  regulations: string | null;

  identification: OceanIdentification;
  lookalikes: OceanLookalike[];

  culinary: OceanCulinary;
  conservationNotes: string | null;
  sources: Source[];
  autoCompiled?: boolean;
  verification?: Verification;
}
