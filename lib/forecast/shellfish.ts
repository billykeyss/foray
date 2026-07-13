import { suggestShellfish, oceanRegionCoverage } from "../shellfish-season.ts";
import type { Forecaster } from "./types";

export const shellfishForecaster: Forecaster = {
  kind: "shellfish",
  title: "Tide & shellfish",
  emptyState: "Nothing in season on this coast right now.",
  suggest: (env, regionTerms) => suggestShellfish(env, regionTerms),
  hasRegionCoverage: (regionTerms) => oceanRegionCoverage(regionTerms),
};
