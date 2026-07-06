import { suggestPlants } from "../plant-season.ts";
import type { Forecaster } from "./types";

export const plantForecaster: Forecaster = {
  kind: "plant",
  title: "Greens & fruit in season",
  emptyState: "Nothing's in season here right now — wild greens return in spring.",
  suggest: (env, regionTerms) => suggestPlants(env, regionTerms),
};
