/**
 * RunningView — RN port of `components/home/RunningView.tsx`.
 *
 * Same wall-clock model: countdown is computed every render from
 * `Date.now() - phaseStartedAt`. AppState replaces visibilitychange /
 * focus / pageshow — when the app returns to "active", we resync
 * immediately so a long lock-screen interval doesn't display stale
 * numbers.
 *
 * Phase 3 keeps the long-press end as a JS interval (mirroring web);
 * Phase 5 swaps in `react-native-gesture-handler` LongPressGesture for
 * UI-thread responsiveness (no JS bridge crossings during the hold).
 *
 * Notes-review-on-end is stubbed for Phase 3 — long-press immediately
 * calls `onEnd`. The Phase 5 sheet pass wires NotesSheet back in.
 */

import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  View,
  type AppStateStatus,
} from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { PomodoroSession, KanbanColumnId } from "@tokmato/shared/types";
import { rpc } from "../lib/rpc-client";
import { EditorialText } from "./EditorialText";
import { useTheme } from "../lib/use-theme";

const POMO_MS = 25 * 60 * 1000;
const BUFFER_MS = 60 * 1000;
const HOLD_MS = 1500;

function fmtMmSs(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface RunningViewProps {
  session: PomodoroSession;
  onEnd: (
    assignments: { note: string; action: KanbanColumnId | "delete" }[],
    completedCount: number,
  ) => void;
}

export function RunningView({ session, onEnd }: RunningViewProps) {
  const theme = useTheme();
  const advancePhase = useStore((s) => s.advancePomodoroPhase);

  const { mode, count, phaseStartedAt } = session;
  const phaseDuration = mode === "running" ? POMO_MS : BUFFER_MS;

  const [now, setNow] = useState(() => Date.now());
  const [holding, setHolding] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNotifiedBoundaryRef = useRef<number | null>(null);

  // Wall-clock tick + AppState resync. Pause when backgrounded to save
  // CPU; resync on return to active.
  useEffect(() => {
    function startTick() {
      if (tickRef.current) return;
      const sync = () => setNow(Date.now());
      sync();
      tickRef.current = setInterval(sync, 250);
    }
    function stopTick() {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }
    function handleAppState(state: AppStateStatus) {
      if (state === "active") {
        setNow(Date.now()); // immediate resync
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

  // Auto-advance + (eventual) foreground notification on boundary.
  useEffect(() => {
    const elapsed = now - phaseStartedAt;
    if (elapsed < phaseDuration) return;
    const boundaryAt = phaseStartedAt + phaseDuration;
    if (lastNotifiedBoundaryRef.current !== boundaryAt) {
      lastNotifiedBoundaryRef.current = boundaryAt;
      // Phase 4 wires expo-notifications.scheduleNotificationAsync here
      // for a foreground in-app banner. Server-side push chain
      // (lib/qstash + /api/push/fire) handles the locked-screen path.
    }
    advancePhase({ now });
  }, [now, mode, count, phaseStartedAt, phaseDuration, advancePhase]);

  // Mirror local marker to KV so other devices see this string is live.
  // Cheap to run on every phase change — server skips no-ops via TTL.
  useEffect(() => {
    void rpc
      .setActiveSession({
        task: session.task,
        tag: session.tag,
        type: session.type,
        startedAt: session.startedAt,
        phaseStartedAt: session.phaseStartedAt,
        mode: session.mode,
        count: session.count,
      })
      .catch(() => {
        // Swallow — best-effort. RemoteActiveBanner will simply not
        // mirror to other devices.
      });
  }, [session.startedAt, session.phaseStartedAt, session.mode, session.count]);

  const elapsed = Math.max(0, now - phaseStartedAt);
  const remaining = Math.max(0, phaseDuration - elapsed);

  const startHold = () => {
    setHolding(0);
    const start = Date.now();
    holdTimerRef.current = setInterval(() => {
      const t = (Date.now() - start) / HOLD_MS;
      if (t >= 1) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        setHolding(1);
        triggerEnd();
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

  const triggerEnd = () => {
    const awardCount = mode === "buffer" ? count : Math.max(0, count - 1);
    // Phase 5 reintroduces NotesSheet review for non-empty notes.
    onEnd([], awardCount);
  };

  const tone =
    mode === "running" ? theme.color.tomato : theme.color.tealDeep;

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 24 }}>
      <View>
        <EditorialText weight="sans" size={12} color={theme.color.ink3}>
          {mode === "running" ? `第 ${count} 个番茄` : `缓冲 · 下一个第 ${count + 1} 个`}
        </EditorialText>
        <EditorialText
          weight="serif"
          size={88}
          color={tone}
          style={{ marginTop: 8, lineHeight: 92 }}
        >
          {fmtMmSs(remaining)}
        </EditorialText>
        <EditorialText weight="kaiti" size={18} color={theme.color.ink2} style={{ marginTop: 12 }}>
          {session.task || "（无标题）"}
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
          borderColor: holding > 0 ? theme.color.tomato : theme.color.rule,
          borderRadius: 12,
          backgroundColor: holding > 0
            ? theme.color.tomatoSoft
            : "transparent",
        }}
      >
        <EditorialText weight="sans" size={14} color={theme.color.ink}>
          {holding === 0 ? "长按结束" : `结束中 · ${Math.round(holding * 100)}%`}
        </EditorialText>
      </Pressable>
    </View>
  );
}
