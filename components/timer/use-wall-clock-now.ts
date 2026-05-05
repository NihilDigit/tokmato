"use client";

import { useEffect, useState } from "react";

export function useWallClockNow({
  paused = false,
  intervalMs = 250,
}: {
  paused?: boolean;
  intervalMs?: number;
} = {}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paused) return;
    const sync = () => setNow(Date.now());
    sync();
    const id = setInterval(sync, intervalMs);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [paused, intervalMs]);

  return now;
}
