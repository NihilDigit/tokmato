/**
 * Single source of truth for the tokmato API host.
 *
 * Resolution order (first match wins):
 *   1. `process.env.EXPO_PUBLIC_API_BASE` — inlined at bundle time
 *      from a `.env.local` next to `mobile/`. Use this for local dev
 *      against `bun run dev` (Next.js on the host machine):
 *        - Android emulator → `http://10.0.2.2:3000`
 *        - iOS simulator    → `http://localhost:3000`
 *        - physical device  → `http://<host LAN ip>:3000`
 *   2. `app.json` `expo.extra.apiBase` — committed default, prod URL.
 *   3. Hard-coded fallback (same prod URL).
 */

import Constants from "expo-constants";

const fallback = "https://tokmato.nihildigit.dev";

export function apiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_BASE;
  if (env && env.length > 0) return env;
  const extra =
    (Constants.expoConfig?.extra as { apiBase?: string } | undefined) ??
    (Constants.manifest2?.extra?.expoClient?.extra as
      | { apiBase?: string }
      | undefined) ??
    {};
  return extra.apiBase ?? fallback;
}
