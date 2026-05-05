/**
 * RunningView — RN port of `components/home/RunningView.tsx`.
 *
 * Same wall-clock model: countdown is computed every render from
 * `Date.now() - phaseStartedAt`. AppState replaces visibilitychange /
 * focus / pageshow — when the app returns to "active", we resync
 * immediately so a long lock-screen interval doesn't display stale
 * numbers.
 *
 * Buffer mode shows a visually distinct affordance with a 继续下一个
 * button; on tap we call `advancePomodoroPhase({ manual: true })` and
 * re-arm the push chain + cross-device active marker for the new phase.
 *
 * Running mode also exposes a quick note input that pipes into
 * `addNoteToSession` — the note then surfaces in `NotesSheet` at the
 * end-of-string review.
 */

import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  TextInput,
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
  const addNote = useStore((s) => s.addNoteToSession);

  const { mode, count, phaseStartedAt, notes } = session;
  const phaseDuration = mode === "running" ? POMO_MS : BUFFER_MS;
  const isBuffer = mode === "buffer";

  const [now, setNow] = useState(() => Date.now());
  const [holding, setHolding] = useState(0);
  const [noteDraft, setNoteDraft] = useState("");
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

  // Auto-advance on natural boundary cross.
  useEffect(() => {
    const elapsed = now - phaseStartedAt;
    if (elapsed < phaseDuration) return;
    const boundaryAt = phaseStartedAt + phaseDuration;
    if (lastNotifiedBoundaryRef.current !== boundaryAt) {
      lastNotifiedBoundaryRef.current = boundaryAt;
      // Foreground in-app notification handled by the OS when a queued
      // FCM lands; no explicit local notification here.
    }
    advancePhase({ now });
  }, [now, mode, count, phaseStartedAt, phaseDuration, advancePhase]);

  // Mirror local marker to KV so other devices see this string is live.
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
      .catch(() => {});
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
    const awardCount = isBuffer ? count : Math.max(0, count - 1);
    onEnd([], awardCount);
  };

  const handleManualContinue = () => {
    advancePhase({ manual: true });
    // Re-read store to capture the post-advance phase, then re-arm the
    // server-scheduled boundary + cross-device marker.
    const fresh = useStore.getState().session;
    if (!fresh) return;
    void rpc
      .startPushChain({
        sessionId: String(fresh.phaseStartedAt),
        boundaryAt: fresh.phaseStartedAt + POMO_MS,
        kind: "running-end",
        count: fresh.count,
      })
      .catch(() => {});
    void rpc
      .setActiveSession({
        task: fresh.task,
        tag: fresh.tag,
        type: fresh.type,
        startedAt: fresh.startedAt,
        phaseStartedAt: fresh.phaseStartedAt,
        mode: fresh.mode,
        count: fresh.count,
      })
      .catch(() => {});
  };

  const submitNote = () => {
    const t = noteDraft.trim();
    if (!t) return;
    addNote(t);
    setNoteDraft("");
  };

  const tone = isBuffer ? theme.color.tealDeep : theme.color.tomato;

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 24 }}>
      <View>
        <EditorialText weight="sans" size={12} color={theme.color.ink3}>
          {isBuffer ? `缓冲 · 下一个第 ${count + 1} 个` : `第 ${count} 个番茄`}
        </EditorialText>
        <EditorialText
          weight="serif"
          size={88}
          color={tone}
          style={{ marginTop: 8, lineHeight: 92 }}
        >
          {fmtMmSs(remaining)}
        </EditorialText>
        <EditorialText
          weight="kaiti"
          size={18}
          color={theme.color.ink2}
          style={{ marginTop: 12 }}
        >
          {session.task || "（无标题）"}
        </EditorialText>
      </View>

      {isBuffer ? (
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={handleManualContinue}
            style={{
              alignSelf: "flex-start",
              paddingVertical: 14,
              paddingHorizontal: 22,
              borderRadius: 12,
              backgroundColor: theme.color.tealDeep,
            }}
          >
            <EditorialText weight="sans" size={14} color={theme.color.paper}>
              继续下一个 →
            </EditorialText>
          </Pressable>
          <Pressable
            onPressIn={startHold}
            onPressOut={cancelHold}
            style={{
              alignSelf: "flex-start",
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderWidth: 1,
              borderColor: holding > 0 ? theme.color.tomato : theme.color.rule,
              borderRadius: 12,
              backgroundColor: holding > 0 ? theme.color.tomatoSoft : "transparent",
            }}
          >
            <EditorialText weight="sans" size={13} color={theme.color.ink}>
              {holding === 0 ? "结束这一串（长按）" : `结束中 · ${Math.round(holding * 100)}%`}
            </EditorialText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <EditorialText weight="sans" size={11} color={theme.color.ink3}>
              想到点什么 · 串结束时再分发
            </EditorialText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                onSubmitEditing={submitNote}
                placeholder="一句话"
                placeholderTextColor={theme.color.inkMute}
                returnKeyType="done"
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  fontSize: 14,
                  color: theme.color.ink,
                  fontFamily: theme.fonts.kaiti,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.color.rule,
                }}
              />
              <Pressable
                onPress={submitNote}
                disabled={!noteDraft.trim()}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.color.rule,
                  opacity: noteDraft.trim() ? 1 : 0.4,
                }}
              >
                <EditorialText weight="sans" size={12} color={theme.color.ink}>
                  + 记
                </EditorialText>
              </Pressable>
            </View>
            {notes.length > 0 ? (
              <EditorialText weight="mono" size={11} color={theme.color.ink3}>
                {`已记 ${notes.length} 条`}
              </EditorialText>
            ) : null}
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
              backgroundColor: holding > 0 ? theme.color.tomatoSoft : "transparent",
            }}
          >
            <EditorialText weight="sans" size={14} color={theme.color.ink}>
              {holding === 0 ? "长按结束" : `结束中 · ${Math.round(holding * 100)}%`}
            </EditorialText>
          </Pressable>
        </>
      )}
    </View>
  );
}
