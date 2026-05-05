# tokmato-mobile

React Native (Expo SDK 52) port of tokmato. Replaces the
`capacitor/` WebView shell with a real native UI that:
- Drives gestures (kanban radial menu, sheet physics) on the UI
  thread via react-native-gesture-handler + reanimated.
- Receives FCM push directly through expo-notifications (the same
  Doze-bypass `priority:high` channel the Capacitor build proved
  out — see `../capacitor/EXPERIMENT.md`).
- Reads / writes the same Zustand store as web via the
  `@tokmato/shared` workspace alias (resolved by Metro to
  `../shared/`).

The web app at `tokmato.nihildigit.dev` is **not affected** by this
subproject — Phase B of the migration plan keeps Next.js as the web
runtime.

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

Required env in `mobile/app.json` `expo.extra`:
- `apiBase`: Defaults to `https://tokmato.nihildigit.dev`. Override
  for local dev: `bunx expo start` → press `?` → manual URL.
- `githubClientId`: GitHub OAuth App client id. The web app and the
  RN app can share one — GitHub allows multiple callback URIs per
  app. Add `tokmato://auth/callback` alongside the web one.

## Build pipeline

Production APKs are built by `.github/workflows/release-mobile.yml`
on every `v*` tag. Same secrets as the legacy
`release-apk.yml` (Capacitor) plus `EXPO_TOKEN`. Output is attached
to the GitHub Release alongside the Capacitor APK.

Local production builds:

```bash
cd mobile
EAS_TOKEN=... eas build --platform android --profile production-apk --local
```

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

## Sheets pending Phase 5b port

See `components/sheets/_TODO_phase5b.md` — 9 sheets still need
direct ports. The critical-path 5 (Start, Notes, AddKanban, Pool,
WishRedeem) ship in this iteration.

## When to retire `capacitor/`

The Phase 6 plan calls for deletion. Don't delete until:
- An EAS-built mobile/ APK has shipped on a `v3.x` tag.
- A device test confirms parity:
  - GitHub OAuth completes (deep link callback).
  - Cloud sync round-trips.
  - 5-min pomodoro + lock screen + boundary push arrives <3s.
  - Kanban radial gesture commits a column move.
- Then: `rm -rf capacitor/` + delete `release-apk.yml` + rename
  `release-mobile.yml` → `release-apk.yml`.
