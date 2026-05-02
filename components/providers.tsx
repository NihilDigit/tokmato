"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { EntertainmentRunningView } from "@/components/play/EntertainmentRunningView";
import { selectSnapshot, useStore } from "@/lib/store";
import { saveToCloud, loadFromCloud } from "@/app/actions/sync";

const AUTOSAVE_DEBOUNCE_MS = 2_000;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ProviderInner>{children}</ProviderInner>
    </SessionProvider>
  );
}

function ProviderInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  // Lazy initializer + null-safe access: during static prerender (e.g.
  // /_not-found) the zustand persist API may not be attached yet, in
  // which case we treat "not hydrated" as the initial state. The real
  // rehydrate runs in the useEffect below.
  const [storeReady, setStoreReady] = useState<boolean>(
    () => useStore.persist?.hasHydrated() ?? false,
  );
  const welcomeGrantedCount = useStore((s) => s.welcomeGrantedUserIds.length);

  // Manually rehydrate the persisted store after mount (paired with
  // `skipHydration: true` in lib/store.ts) — keeps SSR HTML consistent
  // with the first client render.
  useEffect(() => {
    const persist = useStore.persist;
    if (!persist) {
      // No persist API in this environment (shouldn't happen on the
      // client, but keep the ready flag advancing rather than wedging).
      setStoreReady(true);
      return;
    }
    const hydrated = persist.rehydrate();
    if (hydrated instanceof Promise) {
      void hydrated.then(() => {
        useStore.getState().ensureToday();
        setStoreReady(true);
      });
      return;
    }
    queueMicrotask(() => {
      useStore.getState().ensureToday();
      setStoreReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storeReady) return;
    if (status !== "authenticated") return;
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) return;
    useStore.getState().grantWelcomeBonus(user.id);
  }, [session?.user, status, storeReady, welcomeGrantedCount]);

  // ─── Auto-sync: app-open LWW load (once per auth session) ──────────────
  // Only overwrite local when the cloud snapshot is strictly newer than
  // what this device last in-sync'd against. `lastSavedAt = 0` (default
  // for a brand-new device) means "accept whatever cloud has".
  const autoLoadRanRef = useRef(false);
  useEffect(() => {
    if (!storeReady) return;
    if (status !== "authenticated") return;
    if (autoLoadRanRef.current) return;
    autoLoadRanRef.current = true;
    void (async () => {
      try {
        const remote = await loadFromCloud();
        if (!remote) return;
        const local = useStore.getState();
        if (remote.savedAt > local.lastSavedAt) {
          useStore
            .getState()
            .applyCloudSnapshot(
              remote.snapshot as Partial<typeof local>,
              remote.savedAt,
            );
        } else {
          // Already in sync — record it so subsequent saves don't think
          // we're behind cloud.
          useStore.getState().markSynced(remote.savedAt);
        }
      } catch {
        // Network/auth flap — leave local untouched. The user can hit
        // "立即拉取" in Settings to retry.
      }
    })();
  }, [storeReady, status]);

  // ─── Auto-sync: debounced save on token-balance changes ────────────────
  // Subscribe at module level (not via the React hook) so we don't
  // re-create the listener on every render. The listener fires on
  // every store mutation but we filter to balance-affecting fields
  // before kicking the debounce timer.
  useEffect(() => {
    if (!storeReady) return;
    if (status !== "authenticated") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSig = balanceSignature(useStore.getState());

    const flush = async () => {
      timer = null;
      try {
        const snap = selectSnapshot(useStore.getState());
        const res = await saveToCloud(snap);
        useStore.getState().markSynced(res.savedAt);
      } catch {
        // Ignore — autosave is best-effort. The Settings page surfaces
        // explicit save failures; here we'd just fire-and-forget.
      }
    };

    const unsub = useStore.subscribe((state) => {
      const sig = balanceSignature(state);
      if (sig === lastSig) return;
      lastSig = sig;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [storeReady, status]);

  // Read play session at the root so the timer overlay shows on any tab.
  const playSession = useStore((s) => s.playSession);
  const endPlay = useStore((s) => s.endPlay);

  return (
    <ThemeProvider>
      {children}
      {playSession && (
        <EntertainmentRunningView
          session={playSession}
          onEnd={({ refundMinutes }) => endPlay({ refundMinutes })}
        />
      )}
    </ThemeProvider>
  );
}

/** Signature of the fields that should trigger an autosave. Stringified
 *  so cheap equality compares two consecutive emissions; if balances or
 *  collections that meaningfully record progress change, we save. */
function balanceSignature(s: ReturnType<typeof useStore.getState>): string {
  return [
    s.ftoken,
    s.htoken,
    s.timePool,
    s.lastSettledDate ?? "",
    s.todayPomos,
    s.todayMathPomos,
    s.tokenHistory.length,
    s.pomodoroHistory.length,
    s.wishlist.length,
    s.achievements.length,
    s.foodPresets.length,
    // Kanban changes don't gate on balance but the user expects them to
    // sync — fold a stable kanban shape into the signature.
    s.kanban.inbox.length,
    s.kanban.Q1.length,
    s.kanban.Q2.length,
    s.kanban.Q3.length,
    s.kanban.Q4.length,
  ].join("|");
}
