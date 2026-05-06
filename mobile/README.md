# tokmato-mobile

React Native (Expo SDK 52) port of tokmato. The native UI:
- Drives gestures (kanban radial menu, sheet physics) on the UI
  thread via react-native-gesture-handler + reanimated.
- Receives FCM push directly through expo-notifications, the same
  Doze-bypass `priority:high` channel the legacy Capacitor build
  proved out before retirement.
- Reads / writes the same Zustand store as web via the
  `@tokmato/shared` workspace alias (resolved by Metro to
  `../shared/`).

The web app at `tokmato.nihildigit.dev` is **not affected** by this
subproject — Next.js stays the web runtime; this is the Android
delivery only.

## Stack

- Expo SDK 52 + Expo Router 4 + RN 0.76 + new architecture on
- @react-native-async-storage/async-storage — injected into
  `@tokmato/shared/storage-port` at app boot
- expo-secure-store — JWT lives here
- expo-auth-session — GitHub OAuth PKCE
- expo-notifications — FCM token registration + foreground handler
- @gorhom/bottom-sheet — sheet primitive (replaces Radix Sheet)
- react-native-gesture-handler + reanimated — gestures
- react-native-unistyles v3 — theme-aware StyleSheet (replaces
  Tailwind on RN; web keeps Tailwind v4)
- @shopify/flash-list — list virtualization (Journey ledger)
- react-native-svg — kanban radial menu chrome

## Getting started

Prereqs: Bun, Node 22, Android Studio (for emulator), JDK 21.

```bash
# From repo root
bun install                # installs root deps + shared/ types
cd mobile
bun install                # installs mobile workspace deps
bunx expo start            # dev server with bundled QR
# in another terminal:
bunx expo run:android      # build + install dev APK on emulator
```

Local dev against the host's Next.js:

1. Run `bun run dev` in the repo root (Next.js on `:3000`).
2. Copy `mobile/.env.example` to `mobile/.env.local` and adjust:
   - Android emulator → `EXPO_PUBLIC_API_BASE=http://10.0.2.2:3000`
   - iOS simulator    → `http://localhost:3000`
   - Physical device  → `http://<host-LAN-ip>:3000` (same wifi)
3. `bunx expo start` then `bunx expo run:android`.

`process.env.EXPO_PUBLIC_API_BASE` is inlined at bundle time, so changing
`.env.local` requires a Metro restart (`r` in the expo CLI) for the
new value to take effect.

Production builds ignore `.env.local` (the file is gitignored and
EAS Build doesn't see it); they fall back to `app.json` `expo.extra.apiBase`.

> Caveat — Metro must run under Node, not Bun. `bunx expo start` is
> fine because expo's CLI has a `#!/usr/bin/env node` shebang. Avoid
> `bunx --bun expo start`: jest-worker's IPC under Bun drops the
> `fileBuffer` argument when transforming `require.context` virtual
> modules (expo-router's `_ctx.js`), and Metro falls back to reading
> the synthetic `app?ctx=…` path from disk → ENOENT → red box.

GitHub OAuth client_id is fetched from `/api/rpc/github-client-id`
on first sign-in and cached in memory — the value lives in Vercel
env as `AUTH_GITHUB_ID` (same one web's next-auth uses), no RN-side
config needed. The OAuth App's callback list needs
`tokmato://auth/callback` alongside the web callback.

## Build pipeline

`mobile/google-services.json` is committed (the Firebase Android
client config is designed to ship inside the APK; security comes from
the SHA-256 fingerprint check, not file secrecy). EAS Build picks it
up via VCS automatically.

`mobile/app.json` `expo.extra.eas.projectId` is the link to the EAS
project (`@nihildigit/tokmato`). Created via `eas init` once locally;
must stay committed for `eas build` to work in non-interactive CI.

Production APKs are built by `.github/workflows/release-apk.yml` on
every `v*` tag. Required secrets: `EXPO_TOKEN`,
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The workflow:
1. Restores the keystore from secrets to `mobile/credentials/`.
2. Constructs `mobile/credentials.json` pointing at it.
3. Runs `eas build --platform android --profile production-apk
   --local --non-interactive` (uses the GH runner, not Expo cloud,
   so no EAS Build credit is consumed).
4. Renames the APK and attaches it to the auto-published GitHub
   Release (release notes from the annotated tag body).

Local production build:

```bash
cd mobile
bunx eas-cli login          # one-time; uses your expo.dev account
bunx eas-cli build --platform android --profile production-apk \
  --local --non-interactive --output ../tokmato-local.apk
```

The first `eas build` invocation pulls release credentials from the
EAS project (`credentialsSource: "remote"` per `eas.json`), so the
keystore lives on Expo's side. Local builds don't need a local
`credentials.json` unless you opt into `credentialsSource: "local"`.

## Auth flow

1. User taps 使用 GitHub 登录.
2. Expo AuthSession opens browser to GitHub OAuth.
3. GitHub redirects to `tokmato://auth/callback` with code +
   verifier.
4. PKCE exchange happens with GitHub directly → access_token.
5. POST `/api/rpc/exchange-github-token` with that token.
6. Server hits `https://api.github.com/user`, mints a JWT with
   `sub = github:${id}` (matching `auth.ts:33-34`), 30-day TTL.
7. JWT lands in expo-secure-store.
8. Every subsequent `/api/rpc/*` call sends `Authorization: Bearer`.

The web app still uses HttpOnly cookie sessions; both transports
hit the same `lib/rpc-auth.ts` resolver server-side.

## Sheets

12 of the 13 web sheets ship as direct RN ports. `LedgerSheet` and
`WelcomeGuideSheet` stay deferred — Journey screen renders the same
ledger via FlashList, and mobile users typically onboard on web
first. See `components/sheets/_TODO_phase5b.md` for the rationale.
