"use client";

/**
 * Cross-device awareness — fetches the active-session marker on a 30s
 * cadence while the document is foreground, and on every visibility-
 * regained event.
 *
 * "Self vs other" is decided by comparing `startedAt` (the immutable
 * session identity) against the local store's `session.startedAt`.
 * Anything else means another device is the active one.
 *
 * Returns `remoteActive = null` whenever there's no foreign session
 * — including when the local device is the originator. UI gates only
 * on `remoteActive !== null`.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useStore } from "@/lib/store";
import { getActiveSession, type ActiveSessionMarker } from "@/app/actions/active-session";

const POLL_MS = 30_000;

export function useActiveSession(): {
  remoteActive: ActiveSessionMarker | null;
  clearRemoteActive: () => void;
} {
  const { status } = useSession();
  const localStartedAt = useStore((s) => s.session?.startedAt ?? null);
  const [marker, setMarker] = useState<ActiveSessionMarker | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setMarker(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const r = await getActiveSession();
        if (!cancelled) setMarker(r);
      } catch {
        // Network blip or unauth flap — keep the last good value
        // rather than thrash the banner on/off.
      }
    };

    const start = () => {
      if (timer) return;
      poll();
      timer = setInterval(poll, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (typeof document === "undefined") {
      start();
      return () => {
        cancelled = true;
        stop();
      };
    }

    if (document.visibilityState === "visible") start();

    const onVis = () => {
      if (document.visibilityState === "visible") {
        // poll() runs immediately so a tab regaining focus shows the
        // current state rather than the stale snapshot from before.
        poll();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status]);

  const isSelf =
    marker !== null && localStartedAt !== null && marker.startedAt === localStartedAt;
  return {
    remoteActive: isSelf ? null : marker,
    clearRemoteActive: () => setMarker(null),
  };
}
