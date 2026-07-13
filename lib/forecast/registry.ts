import type { Forecaster } from "./types";
import { mushroomForecaster } from "./mushroom.ts";
import { plantForecaster } from "./plant.ts";
import { shellfishForecaster } from "./shellfish.ts";

/** Order = Today-page section order. */
export const REGISTRY: Forecaster[] = [mushroomForecaster, plantForecaster, shellfishForecaster];
