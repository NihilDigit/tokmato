"use client";

import { useEffect, useState } from "react";

const MOBILE_BP = 768; // px — matches @media (max-width: 768px) elsewhere

/**
 * Returns true when viewport is at or below the mobile breakpoint.
 * Hydration-safe: returns `false` on first server render, then matches
 * `window.matchMedia` once mounted.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
