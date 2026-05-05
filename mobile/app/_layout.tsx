/**
 * Root layout — runs once on app launch.
 * - Installs the AsyncStorage adapter into the shared storage port.
 * - Rehydrates the persisted store before children mount.
 * - Wires cloud auto-load + auto-save once the JWT is available.
 *
 * No UI gating during rehydrate — the persist hook returns DEFAULTS
 * until the read completes, which matches web's `skipHydration: true`
 * behavior. Splash screen could be added later if first paint feels too
 * stark.
 */

import "../styles/unistyles";

import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { useStore } from "@tokmato/shared/store";
import { installStorage } from "../lib/storage";
import { attachAutoSave, loadCloudOnce } from "../lib/cloud-sync";

installStorage();

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let detach: (() => void) | undefined;
    (async () => {
      // Mirrors web providers.tsx — manual rehydrate after mount.
      await useStore.persist.rehydrate();
      setHydrated(true);
      await loadCloudOnce();
      detach = attachAutoSave();
    })();
    return () => detach?.();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" options={{ presentation: "modal" }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Keep the exported flag accessible in case a phased screen wants to
// gate its first render on rehydrate completion.
export function useHydrated(): boolean {
  return useStore.persist?.hasHydrated() ?? false;
}
