"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { EntertainmentRunningView } from "@/components/play/EntertainmentRunningView";
import { useStore } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ProviderInner>{children}</ProviderInner>
    </SessionProvider>
  );
}

function ProviderInner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [storeReady, setStoreReady] = useState(useStore.persist.hasHydrated());
  const welcomeGrantUserId = useStore((s) => s.welcomeGrantUserId);

  // Manually rehydrate the persisted store after mount (paired with
  // `skipHydration: true` in lib/store.ts) — keeps SSR HTML consistent
  // with the first client render.
  useEffect(() => {
    const hydrated = useStore.persist.rehydrate();
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
  }, [session?.user, status, storeReady, welcomeGrantUserId]);

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
