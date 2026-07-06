import type { Forecaster } from "./types";
import { mushroomForecaster } from "./mushroom.ts";
import { plantForecaster } from "./plant.ts";

/** Order = Today-page section order. Shellfish appends here in its own spec. */
export const REGISTRY: Forecaster[] = [mushroomForecaster, plantForecaster];
