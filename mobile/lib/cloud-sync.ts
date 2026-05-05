/**
 * RN-side cloud sync orchestration.
 *
 * Mirrors the web `components/providers.tsx` debounced-save / mount-once-load
 * pattern, minus the welcome-bonus seam: that runs through the same
 * `applyMergedSnapshot` action on the shared store.
 *
 * Called from `app/_layout.tsx` after store rehydration. Subscribes to
 * the store, debounces a save when the balance signature changes, and
 * loads from cloud once on mount when authenticated.
 */

import { useStore, selectSnapshot } from "@tokmato/shared/store";
import { rpc, getStoredJwt, RpcError } from "./rpc-client";

const SAVE_DEBOUNCE_MS = 2000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function balanceSignature(): string {
  const s = useStore.getState();
  return JSON.stringify({
    f: s.ftoken,
    h: s.htoken,
    p: s.timePool,
    th: s.tokenHistory.length,
    ph: s.pomodoroHistory.length,
    k: [
      s.kanban.inbox.length,
      s.kanban.Q1.length,
      s.kanban.Q2.length,
      s.kanban.Q3.length,
      s.kanban.Q4.length,
    ],
  });
}

export async function loadCloudOnce(): Promise<void> {
  if (!(await getStoredJwt())) return;
  try {
    const out = await rpc.loadCloud();
    if (out.data) {
      useStore.getState().applyMergedSnapshot(out.data.snapshot, out.data.savedAt);
    }
  } catch (err) {
    if (err instanceof RpcError && err.code === "UNAUTHENTICATED") return;
    console.warn("[cloud-sync] load failed", err);
  }
}

export function attachAutoSave(): () => void {
  let lastSig = balanceSignature();
  const unsub = useStore.subscribe((state) => {
    const sig = JSON.stringify({
      f: state.ftoken,
      h: state.htoken,
      p: state.timePool,
      th: state.tokenHistory.length,
      ph: state.pomodoroHistory.length,
      k: [
        state.kanban.inbox.length,
        state.kanban.Q1.length,
        state.kanban.Q2.length,
        state.kanban.Q3.length,
        state.kanban.Q4.length,
      ],
    });
    if (sig === lastSig) return;
    lastSig = sig;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const jwt = await getStoredJwt();
      if (!jwt) return;
      try {
        const result = await rpc.saveCloud(selectSnapshot(useStore.getState()));
        useStore.getState().markSynced(result.savedAt);
      } catch (err) {
        if (err instanceof RpcError && err.code === "UNAUTHENTICATED") return;
        // Best-effort; settings page is the explicit error surface.
      }
    }, SAVE_DEBOUNCE_MS);
  });
  return () => {
    unsub();
    if (saveTimer) clearTimeout(saveTimer);
  };
}
