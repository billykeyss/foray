"use client";

import { useEffect, useState } from "react";
import { localIsoDate, msUntilNextLocalMidnight } from "./fishing/local-date.ts";

/** Today's device-local date (YYYY-MM-DD) that rolls over while the app stays open or is resumed:
 *  re-read when the page becomes visible, on window focus, and by a timer at the next local midnight.
 *  Put it in the deps of any effect that resolves fishing status / hours / licenses for "today". */
export function useLocalToday(): string {
  const [today, setToday] = useState(() => localIsoDate());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      setToday(localIsoDate());
      clearTimeout(timer);
      // A second past midnight, so the new day has certainly begun; timers can be late, never early by much.
      timer = setTimeout(check, msUntilNextLocalMidnight() + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);
  return today;
}
