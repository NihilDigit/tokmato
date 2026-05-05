/**
 * Single source of truth for the tokmato API host. Read from
 * `app.json` -> `expo.extra.apiBase` so local dev can override
 * (`expo start --tunnel` against a `vercel dev` instance) without
 * rebuilding.
 */

import Constants from "expo-constants";

const fallback = "https://tokmato.nihildigit.dev";

export function apiBase(): string {
  const extra =
    (Constants.expoConfig?.extra as { apiBase?: string } | undefined) ??
    (Constants.manifest2?.extra?.expoClient?.extra as
      | { apiBase?: string }
      | undefined) ??
    {};
  return extra.apiBase ?? fallback;
}
