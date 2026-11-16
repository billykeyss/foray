import { resolveWater, STATUS_LABEL } from "./engine/index.ts";
import type { ResolvedWater, ScopeStatus } from "./engine/index.ts";
import type { WaterDataset } from "./types.ts";

export { STATUS_LABEL };

/** Short badge text per status. */
export const STAMP: Record<ScopeStatus, "OPEN" | "C&R" | "CLOSED" | "CHECK"> = {
  open: "OPEN",
  catch_and_release: "C&R",
  closed: "CLOSED",
  unknown: "CHECK",
};

/** Mirrors Keeper's GET /api/waters/:id/rules response, plus `dataAsOf`. */
export interface WaterRules extends ResolvedWater {
  water: WaterDataset["water"];
  reciprocity: WaterDataset["reciprocity"];
  species: WaterDataset["species"];
  stocking: WaterDataset["stocking"];
  /** The date the rules were resolved for. */
  asOf: string;
  /** When the underlying dataset was generated. */
  dataAsOf: string;
}

export function resolveDataset(ds: WaterDataset, on: string): WaterRules {
  const r = resolveWater(ds.candidates, ds.reaches, on, ds.water.verifyCurrent);
  return {
    water: ds.water,
    status: r.status,
    scopes: r.scopes,
    licenses: r.licenses,
    reciprocity: ds.reciprocity,
    species: ds.species,
    stocking: ds.stocking,
    asOf: on,
    dataAsOf: ds.asOf,
  };
}
