/** Named places for "6 km NE of Truckee" labels: the Reno-anchored spot presets plus nearby towns. */
import { bearingDeg, compass8, haversineKm } from "./geo.ts";

export interface Place {
  name: string;
  lat: number;
  lon: number;
  group?: string;
}

/** Reno-anchored foraging presets (also the old weather-only spot finder's candidate list). */
export const SPOT_PRESETS: Required<Place>[] = [
  { name: "Tahoe Meadows", lat: 39.312, lon: -119.896, group: "Near Reno" },
  { name: "Galena Creek", lat: 39.362, lon: -119.837, group: "Near Reno" },
  { name: "Spooner Summit", lat: 39.106, lon: -119.912, group: "Near Reno" },
  { name: "Mt. Rose Wilderness", lat: 39.343, lon: -119.916, group: "Near Reno" },
  { name: "Truckee", lat: 39.328, lon: -120.183, group: "Tahoe Basin" },
  { name: "Donner Summit", lat: 39.315, lon: -120.336, group: "Tahoe Basin" },
  { name: "Tahoe West Shore", lat: 39.097, lon: -120.123, group: "Tahoe Basin" },
  { name: "Echo Summit", lat: 38.812, lon: -120.034, group: "Tahoe Basin" },
  { name: "Sierra City / Yuba", lat: 39.567, lon: -120.629, group: "Day drives" },
  { name: "Carson Pass", lat: 38.694, lon: -119.986, group: "Day drives" },
  { name: "Ebbetts Pass", lat: 38.545, lon: -119.812, group: "Day drives" },
  { name: "Plumas NF · Quincy", lat: 39.937, lon: -120.947, group: "Day drives" },
  { name: "Lassen NF", lat: 40.487, lon: -121.407, group: "Day drives" },
  { name: "Eastern Sierra · June Lake", lat: 37.779, lon: -119.073, group: "Weekend trips" },
  { name: "Sonora Pass", lat: 38.328, lon: -119.636, group: "Weekend trips" },
  { name: "Lamoille Canyon · Ruby Mtns", lat: 40.652, lon: -115.472, group: "Weekend trips" },
];

const TOWNS: Place[] = [
  { name: "Reno", lat: 39.5296, lon: -119.8138 },
  { name: "Sparks", lat: 39.5349, lon: -119.7527 },
  { name: "Verdi", lat: 39.5185, lon: -120.0013 },
  { name: "Carson City", lat: 39.1638, lon: -119.7674 },
  { name: "Virginia City", lat: 39.3096, lon: -119.6499 },
  { name: "Dayton", lat: 39.2371, lon: -119.5929 },
  { name: "Minden", lat: 38.9541, lon: -119.7654 },
  { name: "Gardnerville", lat: 38.9413, lon: -119.7499 },
  { name: "Markleeville", lat: 38.6941, lon: -119.7802 },
  { name: "South Lake Tahoe", lat: 38.9399, lon: -119.9772 },
  { name: "Tahoe City", lat: 39.1677, lon: -120.1452 },
  { name: "Incline Village", lat: 39.2513, lon: -119.973 },
  { name: "Kings Beach", lat: 39.2377, lon: -120.0266 },
  { name: "Kirkwood", lat: 38.7024, lon: -120.0716 },
  { name: "Sierraville", lat: 39.5888, lon: -120.3666 },
  { name: "Loyalton", lat: 39.6763, lon: -120.241 },
  { name: "Portola", lat: 39.8105, lon: -120.4691 },
  { name: "Graeagle", lat: 39.7666, lon: -120.6197 },
  { name: "Quincy", lat: 39.9368, lon: -120.9472 },
  { name: "Downieville", lat: 39.5593, lon: -120.8266 },
  { name: "Nevada City", lat: 39.2616, lon: -121.0161 },
  { name: "Grass Valley", lat: 39.2191, lon: -121.0611 },
  { name: "Auburn", lat: 38.8966, lon: -121.0769 },
  { name: "Placerville", lat: 38.7296, lon: -120.7985 },
  { name: "Pollock Pines", lat: 38.7616, lon: -120.586 },
  { name: "Susanville", lat: 40.4163, lon: -120.653 },
  { name: "Chester", lat: 40.3063, lon: -121.2316 },
  { name: "Bridgeport", lat: 38.2557, lon: -119.2313 },
  { name: "Lee Vining", lat: 37.9577, lon: -119.121 },
  { name: "Mammoth Lakes", lat: 37.6485, lon: -118.9721 },
  { name: "Bishop", lat: 37.3635, lon: -118.3951 },
  { name: "Yerington", lat: 38.9858, lon: -119.1629 },
  { name: "Fallon", lat: 39.4735, lon: -118.7774 },
  { name: "Elko", lat: 40.8324, lon: -115.7631 },
];

export const PLACES: Place[] = [...TOWNS, ...SPOT_PRESETS.map(({ name, lat, lon }) => ({ name, lat, lon }))];

/** "6 km NE of Truckee", "At Truckee" (<1 km), or plain coordinates when nothing is within 60 km. */
export function placeLabel(lat: number, lon: number, places: Place[] = PLACES): string {
  const p = { lat, lon };
  let best: Place | null = null;
  let bestKm = Infinity;
  for (const pl of places) {
    const d = haversineKm(p, pl);
    if (d < bestKm) {
      bestKm = d;
      best = pl;
    }
  }
  if (!best || bestKm > 60) return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  if (bestKm < 1) return `At ${best.name}`;
  return `${Math.round(bestKm)} km ${compass8(bearingDeg(best, p))} of ${best.name}`;
}
