"use client";

/**
 * Cross-device awareness pill — shown on every route EXCEPT /home
 * (where the full `RemoteActiveView` mirror already covers it).
 * Sticks to the top of the page-shell so the user knows another
 * device is still mid-pomodoro no matter which tab they're on.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useActiveSession } from "@/lib/use-active-session";
import { cancelPushChain } from "@/app/actions/push";
import { clearActiveSession } from "@/app/actions/active-session";
import { cn } from "@/lib/utils";

const POMO_MS = 25 * 60 * 1000;

function fmtMmSs(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RemoteActiveBanner() {
  const { remoteActive, clearRemoteActive } = useActiveSession();
  const pathname = usePathname();
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);

  // Tick only while we're rendering. The hook above already handles
  // poll/visibility; we just need a clock for the displayed countdown.
  useEffect(() => {
    if (!remoteActive) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [remoteActive]);

  if (!remoteActive) return null;
  if (pathname === "/home" || pathname === "/") return null;

  const elapsed = Math.max(0, now - remoteActive.phaseStartedAt);
  const remainingMs = Math.max(0, POMO_MS - elapsed);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-30 -mx-(--page-pad-x) mb-3 flex items-center gap-3",
        "border-b border-rule bg-paper/85 px-(--page-pad-x) py-2",
        "backdrop-blur supports-[backdrop-filter]:bg-paper/70",
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-tomato animate-pulse"
      />
      <span className="smallcaps shrink-0 text-ink-2">另一端番茄中</span>
      <span className="mono text-xs text-ink-3">
        第 {remoteActive.count} · {fmtMmSs(remainingMs)}
      </span>
      <span className="ml-auto truncate text-sm text-ink-2">
        {remoteActive.task}
      </span>
      <button
        type="button"
        disabled={ending}
        onClick={() => {
          setEnding(true);
          void Promise.allSettled([
            cancelPushChain("pomodoro"),
            clearActiveSession(),
          ]).then(() => {
            clearRemoteActive();
          });
        }}
        className="shrink-0 rounded-full border border-rule px-3 py-1 text-[12px] text-ink-3 transition hover:border-tomato/40 hover:text-tomato disabled:opacity-50"
      >
        {ending ? "结束中" : "结束"}
      </button>
    </div>
  );
}
