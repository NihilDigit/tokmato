"use client";

import { useEffect, useRef, useState } from "react";

export function useHoldConfirm(
  onConfirm: () => void,
  { holdMs = 1500, disabled = false }: { holdMs?: number; disabled?: boolean } = {},
) {
  const [holding, setHolding] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmedRef = useRef(false);

  const cancelHold = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    confirmedRef.current = false;
    setHolding(0);
  };

  const startHold = () => {
    if (disabled) return;
    cancelHold();
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const progress = (Date.now() - startedAt) / holdMs;
      if (progress >= 1) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (confirmedRef.current) return;
        confirmedRef.current = true;
        setHolding(1);
        onConfirm();
        return;
      }
      setHolding(progress);
    }, 16);
  };

  useEffect(() => cancelHold, []);

  return {
    holding,
    startHold,
    cancelHold,
  };
}
