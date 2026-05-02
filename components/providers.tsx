"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { EntertainmentRunningView } from "@/components/play/EntertainmentRunningView";
import { useStore } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
  // Manually rehydrate the persisted store after mount (paired with
  // `skipHydration: true` in lib/store.ts) — keeps SSR HTML consistent
  // with the first client render.
  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);

  // Read play session at the root so the timer overlay shows on any tab.
  const playSession = useStore((s) => s.playSession);
  const endPlay = useStore((s) => s.endPlay);

  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        {playSession && (
          <EntertainmentRunningView
            session={playSession}
            onEnd={({ refundMinutes }) => endPlay({ refundMinutes })}
          />
        )}
      </ThemeProvider>
    </SessionProvider>
  );
}
