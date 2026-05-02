"use client";

/**
 * EntertainmentRunningView — full-screen overlay shown while a play
 * session is active. Mirrors RunningView's vocabulary (large mono
 * countdown + long-press end), but no confetti. Ending early refunds
 * the unused pool minutes; ending naturally (timer reaches 0) does not.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PlaySession } from "@/lib/types";

const HOLD_MS = 1500;

const TYPE_LABEL: Record<PlaySession["type"], string> = {
  active: "主动型",
  passive: "被动型",
};

const TYPE_TONE: Record<PlaySession["type"], string> = {
  active: "text-sage-deep",
  passive: "text-plum",
};

function fmtMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface EntertainmentRunningViewProps {
  session: PlaySession;
  /** Called when timer reaches 0 OR user long-presses end early.
   *  `refundMinutes` is non-zero only on early-end. */
  onEnd: (data: { refundMinutes: number }) => void;
}

export function EntertainmentRunningView({
  session,
  onEnd,
}: EntertainmentRunningViewProps) {
  const totalSec = session.totalMinutes * 60;
  const elapsedAtMount = Math.floor((Date.now() - session.startedAt) / 1000);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, totalSec - elapsedAtMount)
  );
  const [holding, setHolding] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown
  useEffect(() => {
    if (secondsLeft <= 0) {
      onEnd({ refundMinutes: 0 });
      return;
    }
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          onEnd({ refundMinutes: 0 });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
    // onEnd is intentionally omitted; we only react to count change here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Long-press end
  const startHold = () => {
    setHolding(0);
    const start = Date.now();
    holdTimerRef.current = setInterval(() => {
      const t = (Date.now() - start) / HOLD_MS;
      if (t >= 1) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        setHolding(1);
        // Refund unused minutes (rounded down)
        const refund = Math.floor(secondsLeft / 60);
        onEnd({ refundMinutes: refund });
      } else {
        setHolding(t);
      }
    }, 16);
  };
  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(0);
  };
  useEffect(() => () => cancelHold(), []);

  const progress = 1 - secondsLeft / totalSec;

  return (
    <div
      role="dialog"
      aria-label="娱乐进行中"
      className="fade-in fixed inset-0 z-[180] flex flex-col items-center justify-center gap-10 bg-ink/95 p-6 text-paper backdrop-blur-md"
    >
      {/* Type label */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="smallcaps text-paper/60">娱乐进行中</div>
        <div
          className={cn(
            "serif italic text-h2 leading-tight",
            TYPE_TONE[session.type]
          )}
        >
          {TYPE_LABEL[session.type]}
        </div>
      </div>

      {/* Big mono countdown */}
      <div className="flex flex-col items-center gap-3">
        <div className="font-mono text-display leading-none tracking-tight text-paper">
          {fmtMmSs(secondsLeft)}
        </div>
        {/* Thin progress bar */}
        <div className="mt-2 h-1 w-56 overflow-hidden rounded-full bg-paper/15">
          <div
            className="h-full bg-teal transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
            aria-hidden
          />
        </div>
        <div className="mono text-xs text-paper/60 tabular-nums">
          {session.totalMinutes} min · 时间池已扣
        </div>
      </div>

      {/* Long-press end */}
      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        className={cn(
          "relative flex h-14 w-64 max-w-full select-none items-center justify-center overflow-hidden rounded-full",
          "border border-paper/20 bg-paper/5 text-paper transition active:scale-[0.99]"
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 origin-left bg-paper/15 transition-transform duration-75"
          style={{ transform: `scaleX(${holding})` }}
        />
        <span className="relative z-10 text-sm font-medium tracking-wider">
          {holding > 0.05 ? "再长按一会儿..." : "长按提前结束"}
        </span>
      </button>
      <p className="-mt-6 text-center text-[11px] text-paper/50">
        提前结束剩余分钟会回到时间池
      </p>
    </div>
  );
}
