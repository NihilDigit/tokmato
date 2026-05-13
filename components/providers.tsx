"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { EntertainmentRunningView } from "@/components/play/EntertainmentRunningView";
import { WelcomeGuideSheet } from "@/components/sheets/WelcomeGuideSheet";
import { selectSnapshot, useStore } from "@/lib/store";
import { saveToCloud, loadFromCloud } from "@/app/actions/sync";
import { cancelPushChain } from "@/app/actions/push";
import { clearActiveSession } from "@/app/actions/active-session";

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
  const [welcomeGuideOpen, setWelcomeGuideOpen] = useState(false);

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

  // Welcome bonus — per-browser flag (v2.0+), no auth dependency. Anon
  // visitors get the +5F/+10H grant once per browser, so the loop closes
  // before login. Cloud-side dedup is handled at merge time by
  // `dedupWelcomeEntries` in lib/ledger.ts (collapses anon + cloud
  // welcomes into a single entry).
  //
  // Re-runs when `status` changes so an authenticated grant gets a
  // direct saveToCloud follow-up: the autosave subscription captures
  // the post-grant state as its baseline and would otherwise miss the
  // welcome on a "first browser auth, no other balance change before
  // close" path.
  useEffect(() => {
    if (!storeReady) return;
    if (typeof window === "undefined") return;
    let granted = false;
    try {
      if (!window.localStorage.getItem("tokmato:welcome-granted")) {
        window.localStorage.setItem("tokmato:welcome-granted", "1");
        useStore.getState().grantWelcomeBonus();
        granted = true;
      }
    } catch {
      return;
    }
    if (granted && status === "authenticated") {
      void (async () => {
        try {
          const snap = selectSnapshot(useStore.getState());
          const res = await saveToCloud(snap);
          useStore.getState().markSynced(res.savedAt);
        } catch {
          // Best-effort — autosave will catch up on the next mutation.
        }
      })();
    }
  }, [storeReady, status]);

  // First-run guide — same per-browser flag pattern, separate key.
  useEffect(() => {
    if (!storeReady) return;
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem("tokmato:guide-seen")) return;
    } catch {
      return;
    }
    setWelcomeGuideOpen(true);
  }, [storeReady]);

  // v8 just-upgraded cleanup — server-side state (QStash push chain,
  // cross-device active marker) survives a destructive local wipe. If a
  // user upgraded mid-pomodoro, the chain would keep firing against a
  // now-empty client. Run once after auth to drain.
  useEffect(() => {
    if (!storeReady) return;
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    let marker: string | null = null;
    try {
      marker = window.localStorage.getItem("tokmato:v8-just-upgraded");
    } catch {
      return;
    }
    if (!marker) return;
    void Promise.allSettled([
      cancelPushChain("all").catch(() => undefined),
      clearActiveSession().catch(() => undefined),
    ]).then(() => {
      try {
        window.localStorage.removeItem("tokmato:v8-just-upgraded");
      } catch {}
    });
  }, [storeReady, status]);

  // ─── Auto-sync: app-open default-merge load (once per auth session) ───
  // v2.0+ replaces the v1.x LWW wholesale-overwrite. Always merges cloud
  // with local: id-dedup collections, balance = cloud baseline + local
  // entries with createdAt > cloud.savedAt + welcome dedup adjust.
  // Idempotent — re-running with the same cloud snapshot is a no-op.
  // Settings "立即拉取" / "立即推送" remain as escape hatches for
  // wholesale overwrite either direction.
  const autoLoadRanRef = useRef(false);
  useEffect(() => {
    if (!storeReady) return;
    if (status !== "authenticated") return;
    if (autoLoadRanRef.current) return;
    autoLoadRanRef.current = true;
    void (async () => {
      try {
        const remote = await loadFromCloud();
        const store = useStore.getState();
        if (remote) {
          store.applyMergedSnapshot(
            remote.snapshot as Partial<ReturnType<typeof useStore.getState>>,
            remote.savedAt,
          );
        }
        // Rollup runs AFTER merge so the source-of-truth for >30d
        // entries is the deduped union of both sides.
        useStore.getState().runRollup();
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

  // Read play session at the root so the timer rail stays visible on any tab.
  const playSession = useStore((s) => s.playSession);
  const endPlay = useStore((s) => s.endPlay);

  return (
    <ThemeProvider>
      {children}
      {playSession && (
        <EntertainmentRunningView
          session={playSession}
          onEnd={({ refundMinutes }) => {
            endPlay({ refundMinutes });
            // Only early endings should cancel the scheduled play-end
            // notification. Natural expiry keeps the QStash callback alive
            // so a locked/closed device still gets pulled back.
            if (refundMinutes > 0) {
              void cancelPushChain("play").catch(() => {});
            }
          }}
        />
      )}
      <WelcomeGuideSheet
        open={welcomeGuideOpen}
        onOpenChange={setWelcomeGuideOpen}
        onConfirm={() => {
          try {
            window.localStorage.setItem("tokmato:guide-seen", "1");
          } catch {}
        }}
      />
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
    JSON.stringify(s.todayCountsByTag),
    s.tokenHistory.length,
    s.pomodoroHistory.length,
    s.wishlist.length,
    s.achievements.length,
    s.foodPresets.length,
    // Tag and bonus edits are renames/recolors/parameter tweaks that
    // preserve array length — must hash content, not just length, or
    // autosave misses them and the next merge sees stale cloud win.
    JSON.stringify(s.tags),
    JSON.stringify(s.bonuses),
    // Kanban changes don't gate on balance but the user expects them to
    // sync. Hash content, not just column lengths, so edits and delete
    // tombstones are saved too.
    JSON.stringify(s.kanban),
    JSON.stringify(s.kanbanDeletedCardIds ?? []),
  ].join("|");
}
