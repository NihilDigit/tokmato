/**
 * RemoteActiveView — read-only mirror of another device's running
 * pomodoro. Polls /api/rpc/get-active-session every 30s while the
 * screen is foreground, and immediately on AppState → "active".
 *
 * The marker compares against local `session.startedAt`; only a
 * foreign session bubbles up. The wall-clock display uses the same
 * `phaseStartedAt + duration` math as the local view.
 */

import { useEffect, useRef, useState } from "react";
import {
  AppState,
  View,
  type AppStateStatus,
} from "react-native";
import { useStore } from "@tokmato/shared/store";
import { rpc } from "../lib/rpc-client";
import { EditorialText } from "./EditorialText";
import { useTheme } from "../lib/use-theme";

const POLL_MS = 30_000;
const POMO_MS = 25 * 60 * 1000;
const BUFFER_MS = 60 * 1000;

type Marker = {
  task: string;
  tag: string;
  type: "input" | "output";
  startedAt: number;
  phaseStartedAt: number;
  mode: "running" | "buffer";
  count: number;
  updatedAt: number;
};

function fmtMmSs(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function useRemoteActive(): Marker | null {
  const localSession = useStore((s) => s.session);
  const [marker, setMarker] = useState<Marker | null>(null);
  const localStartedAt = localSession?.startedAt ?? null;

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const out = await rpc.getActiveSession();
        if (cancelled) return;
        const data = out.data as Marker | null;
        if (!data) return setMarker(null);
        if (data.startedAt === localStartedAt) return setMarker(null);
        setMarker(data);
      } catch {
        // Best-effort; offline or unauth → no remote mirror.
      }
    }
    void poll();
    const id = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void poll();
    });
    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
  }, [localStartedAt]);

  return marker;
}

export function RemoteActiveView({ marker }: { marker: Marker }) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const phaseDuration = marker.mode === "running" ? POMO_MS : BUFFER_MS;
  const remaining = Math.max(0, phaseDuration - (now - marker.phaseStartedAt));

  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 16 }}>
      <EditorialText weight="sans" size={11} color={theme.color.ink3}>
        其他设备正在运行 · 只读
      </EditorialText>
      <EditorialText
        weight="serif"
        size={72}
        color={theme.color.ink3}
        style={{ lineHeight: 76 }}
      >
        {fmtMmSs(remaining)}
      </EditorialText>
      <EditorialText weight="kaiti" size={16} color={theme.color.ink3}>
        {marker.task || "（无标题）"} · 第 {marker.count} 个
      </EditorialText>
    </View>
  );
}
