"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchWeatherWithMeta, DailyWeather } from "./weather";

interface LocationState {
  lat: number | null;
  lon: number | null;
  label: string;
  weather: DailyWeather[];
  /** Elevation of the weather grid cell, metres (from Open-Meteo); null until loaded. */
  elevationM: number | null;
  loading: boolean;
  error: string | null;
  setLocation: (lat: number, lon: number, label?: string) => void;
}

const Ctx = createContext<LocationState | null>(null);

const STORAGE_KEY = "mycelium.location.v1";

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [label, setLabel] = useState<string>("");
  const [weather, setWeather] = useState<DailyWeather[]>([]);
  const [elevationM, setElevationM] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore last location from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.lat === "number" && typeof saved.lon === "number") {
          setLocation(saved.lat, saved.lon, saved.label ?? "");
          return;
        }
      }
    } catch {}
    // Default: Tahoe Meadows on Mt. Rose Hwy — easiest mid-elevation
    // mixed-conifer access from Reno (~30 min drive, ~2620m).
    setLocation(39.312, -119.896, "Tahoe Meadows");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocation = useCallback(
    async (newLat: number, newLon: number, newLabel?: string) => {
      setLat(newLat);
      setLon(newLon);
      if (newLabel !== undefined) setLabel(newLabel);
      setLoading(true);
      setError(null);
      try {
        const { days: data, elevationM: elev } = await fetchWeatherWithMeta(newLat, newLon);
        setWeather(data);
        setElevationM(elev);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            lat: newLat,
            lon: newLon,
            label: newLabel ?? label,
          })
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch weather");
      } finally {
        setLoading(false);
      }
    },
    [label]
  );

  const value = useMemo(
    () => ({ lat, lon, label, weather, elevationM, loading, error, setLocation }),
    [lat, lon, label, weather, elevationM, loading, error, setLocation]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocation must be inside LocationProvider");
  return ctx;
}
