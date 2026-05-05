/**
 * EntertainmentRunningView — fullscreen RN port of
 * `components/play/EntertainmentRunningView.tsx`. Mounted at the
 * layout root via `app/_layout.tsx`'s playSession watch so it covers
 * any tab the moment a play timer starts.
 *
 * Wall-clock model identical to RunningView: countdown re-derives from
 * `Date.now() - startedAt` every render, AppState resyncs on return to
 * "active". Long-press end refunds remaining minutes back to the pool
 * via `endPlay({ refundMinutes })`.
 */

import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  View,
  type AppStateStatus,
} from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { PlaySession } from "@tokmato/shared/types";
import { EditorialText } from "./EditorialText";
import { useTheme } from "../lib/use-theme";

const HOLD_MS = 1500;

function fmtMmSs(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function refundFromRemaining(
  session: PlaySession,
  now: number,
): number {
  const elapsedMs = Math.max(0, now - session.startedAt);
  const remainingMin = Math.max(
    0,
    session.totalMinutes - Math.floor(elapsedMs / 60_000),
  );
  // Refund follows cost ratio: passive sessions deduct ×2 upfront, so
  // the refund must scale the same way to keep the pool whole.
  const ratio = session.costMinutes / Math.max(1, session.totalMinutes);
  return Math.round(remainingMin * ratio);
}

export function EntertainmentRunningView({
  session,
}: {
  session: PlaySession;
}) {
  const theme = useTheme();
  const endPlay = useStore((s) => s.endPlay);

  const [now, setNow] = useState(() => Date.now());
  const [holding, setHolding] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function startTick() {
      if (tickRef.current) return;
      tickRef.current = setInterval(() => setNow(Date.now()), 250);
    }
    function stopTick() {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }
    function handleAppState(state: AppStateStatus) {
      if (state === "active") {
        setNow(Date.now());
        startTick();
      } else {
        stopTick();
      }
    }
    startTick();
    const sub = AppState.addEventListener("change", handleAppState);
    return () => {
      stopTick();
      sub.remove();
    };
  }, []);

  const totalMs = session.totalMinutes * 60_000;
  const elapsed = Math.max(0, now - session.startedAt);
  const remaining = Math.max(0, totalMs - elapsed);

  // Auto-end when the timer hits zero — refund is 0 by construction.
  useEffect(() => {
    if (remaining > 0) return;
    endPlay({ refundMinutes: 0 });
  }, [remaining, endPlay]);

  const startHold = () => {
    setHolding(0);
    const start = Date.now();
    holdRef.current = setInterval(() => {
      const t = (Date.now() - start) / HOLD_MS;
      if (t >= 1) {
        if (holdRef.current) clearInterval(holdRef.current);
        setHolding(1);
        endPlay({ refundMinutes: refundFromRemaining(session, Date.now()) });
      } else {
        setHolding(t);
      }
    }, 16);
  };
  const cancelHold = () => {
    if (holdRef.current) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
    setHolding(0);
  };
  useEffect(() => () => cancelHold(), []);

  const tone = session.type === "passive" ? theme.color.plum : theme.color.sage;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: theme.color.paper,
        justifyContent: "center",
        paddingHorizontal: 28,
        gap: 24,
      }}
    >
      <View>
        <EditorialText weight="sans" size={11} color={theme.color.ink3}>
          {session.type === "passive" ? "PLAY · 被动" : "PLAY · 主动"}
        </EditorialText>
        <EditorialText
          weight="serif"
          size={88}
          color={tone}
          style={{ marginTop: 8, lineHeight: 92 }}
        >
          {fmtMmSs(remaining)}
        </EditorialText>
        {session.task ? (
          <EditorialText weight="kaiti" size={18} color={theme.color.ink2} style={{ marginTop: 12 }}>
            {session.task}
          </EditorialText>
        ) : null}
        <EditorialText weight="mono" size={11} color={theme.color.ink3} style={{ marginTop: 8 }}>
          {`占用时间池 ${session.costMinutes} min`}
        </EditorialText>
      </View>

      <Pressable
        onPressIn={startHold}
        onPressOut={cancelHold}
        style={{
          alignSelf: "flex-start",
          paddingVertical: 14,
          paddingHorizontal: 22,
          borderWidth: 1,
          borderColor: holding > 0 ? tone : theme.color.rule,
          borderRadius: 12,
          backgroundColor: holding > 0 ? theme.color.tomatoSoft : "transparent",
        }}
      >
        <EditorialText weight="sans" size={14} color={theme.color.ink}>
          {holding === 0 ? "长按结束 · 余量退回时间池" : `结束中 · ${Math.round(holding * 100)}%`}
        </EditorialText>
      </Pressable>
    </View>
  );
}
