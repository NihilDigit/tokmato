"use client";

/**
 * EntertainmentRunningView — compact global rail shown while a play
 * session is active. It keeps the countdown visible across routes without
 * blocking the rest of the app. Ending early refunds the unused pool
 * minutes; ending naturally (timer reaches 0) does not.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useHoldConfirm } from "@/components/timer/use-hold-confirm";
import { useWallClockNow } from "@/components/timer/use-wall-clock-now";
import type { PlaySession } from "@/lib/types";

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

function firePlayNotification() {
  try {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification("娱乐时间到了", {
        body: "时间池里的份额已经用完",
        icon: "/icon.png",
        tag: "tokmato-play",
      });
    }
  } catch {
    // Notification can throw in embedded or permission-changing contexts.
  }
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
  const totalMs = session.totalMinutes * 60 * 1000;
  const costMinutes = session.costMinutes ?? session.totalMinutes;
  const refundScale = session.totalMinutes > 0 ? costMinutes / session.totalMinutes : 1;
  const now = useWallClockNow();
  const secondsLeft = Math.max(
    0,
    Math.ceil((totalMs - (now - session.startedAt)) / 1000)
  );

  // Auto-end at boundary
  const endedRef = useRef(false);
  useEffect(() => {
    if (endedRef.current) return;
    if (secondsLeft <= 0) {
      endedRef.current = true;
      firePlayNotification();
      onEnd({ refundMinutes: 0 });
    }
  }, [secondsLeft, onEnd]);

  const { holding, startHold, cancelHold } = useHoldConfirm(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    // Refund unused pool cost, not just visible timer minutes.
    const refund = Math.floor((secondsLeft / 60) * refundScale);
    onEnd({ refundMinutes: refund });
  });

  const totalSec = totalMs / 1000;
  const progress = totalSec > 0 ? 1 - secondsLeft / totalSec : 1;

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label="娱乐计时器"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-nav-h)+var(--safe-b)+12px)] z-[95] flex justify-center px-3 wide:inset-x-auto wide:right-6 wide:bottom-6 wide:justify-end wide:px-0"
    >
      <div className="pointer-events-auto fade-in w-full max-w-[520px] overflow-hidden rounded-xl border border-rule bg-paper/95 shadow-lift backdrop-blur-xl wide:w-[420px]">
        <div className="h-1 bg-rule">
          <div
            className="h-full bg-teal transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
            aria-hidden
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="smallcaps text-teal-deep">娱乐</span>
              <span
                className={cn(
                  "serif italic text-[17px] leading-tight",
                  TYPE_TONE[session.type]
                )}
              >
                {TYPE_LABEL[session.type]}
              </span>
            </div>
            <div className="mono mt-1 text-[11px] leading-tight text-ink-3 tabular-nums">
              {`${session.totalMinutes} min · 已扣 ${costMinutes} min`}
            </div>
          </div>

          <div className="font-mono text-[30px] leading-none text-ink tabular-nums">
            {fmtMmSs(secondsLeft)}
          </div>

          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            className={cn(
              "relative grid h-11 w-20 shrink-0 select-none place-items-center overflow-hidden rounded-lg",
              "border border-rule bg-paper-2 text-[12px] font-medium text-ink transition active:scale-[0.99]"
            )}
          >
            <div
              aria-hidden
              className="absolute inset-0 origin-left bg-teal-soft transition-transform duration-75"
              style={{ transform: `scaleX(${holding})` }}
            />
            <span className="relative z-10">
              {holding > 0.05 ? "按住" : "结束"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
