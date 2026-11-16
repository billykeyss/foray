"use client";

import { useCallback, useEffect, useState } from "react";
import { LICENSE_KEY, parseLicenses, type License, type LicenseState } from "./license.ts";

/** Saved fishing licenses (one per state) in localStorage under `foray.license.v1`. */
export function useLicense() {
  const [licenses, setLicenses] = useState<License[]>([]);
  useEffect(() => {
    const read = () => {
      try {
        setLicenses(parseLicenses(localStorage.getItem(LICENSE_KEY)));
      } catch {
        setLicenses([]);
      }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("foray-license", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("foray-license", read);
    };
  }, []);
  const setExpiry = useCallback((state: LicenseState, expires: string | null) => {
    let current: License[] = [];
    try {
      current = parseLicenses(localStorage.getItem(LICENSE_KEY));
    } catch {}
    const rest = current.filter((l) => l.state !== state);
    const next = expires ? [...rest, { state, expires }] : rest;
    try {
      localStorage.setItem(LICENSE_KEY, JSON.stringify(next));
    } catch {}
    setLicenses(next);
    window.dispatchEvent(new Event("foray-license"));
  }, []);
  return { licenses, setExpiry };
}
