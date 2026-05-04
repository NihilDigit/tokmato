# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Note: `AGENTS.md` in this repo is a symlink to this file, so AGENTS-aware tools (Cursor, Aider, etc.) read the same content. `README.md` is a separate human-facing document — do not symlink the two.

## ⚠ Next.js 16 — heads-up

This repo uses Next.js 16 with React 19. Several APIs differ from anything in pre-2026 training data: `cookies()` / `headers()` / route `params` are **async**, `middleware.ts` is renamed to `proxy.ts`, PWA manifest goes in `app/manifest.ts` (native), and Turbopack is the default bundler. The bundled docs at `node_modules/next/dist/docs/` are the source of truth — read the relevant guide before writing anything new and heed deprecation notices.

## What this is

**tokmato** — a personal token-economy app for a single user (考研 student, ADHD-leaning). Pomodoro sessions earn FToken (Focus) and HToken (Health); tokens spend into a time pool that funds entertainment / food / wishlist redemption. Deployed to Vercel at https://tokmato.nihildigit.dev. Installable as a PWA, with Web Push notifications that fire even when the browser is closed.

The design constitution lives in `.impeccable.md` — **must-read**. It sets brand voice, palette, info density rules ("杂志调、app 骨"), and what to never do (no marketing副文 / no fake CJK italic / no naked hex).

## Commands

```bash
bun run dev          # Start dev server (Turbopack, port 3000)
bun run build        # Production build + TS typecheck (run before any deploy)
bun run start        # Serve production build
bun run test         # Runs `bun test --env-file=.env.local` so smoke tests see real env
bun test path/to/x   # Single file (will NOT auto-load .env.local — use bun run test)

# Vercel (already linked to nihildigits-projects-daf2fe15/tokmato)
bunx vercel dev                       # Local with Vercel env injected
bunx vercel deploy --prod             # Deploy to production
bunx vercel env pull .env.local --yes # Sync remote env to local
bunx vercel env add NAME production --value "..." -y  # Push a single var

# Add shadcn primitives
bunx --bun shadcn@latest add <component>
```

Production deploys are triggered by pushing a `v*` tag — `.github/workflows/release-deploy.yml` builds and ships via `vercel deploy --prebuilt --prod`. Don't deploy from a local working tree if the goal is a tagged release; tag and push instead. The workflow injects `NEXT_PUBLIC_APP_VERSION = ${github.ref_name}` into the build env so `lib/version.ts` (and hence the UI's version label) tracks the tag automatically — never hand-edit that file.

## Release authoring

Manual, semantic. Auto-generated commit lists are flow-of-thought; semantic notes are the part of version history future-you actually re-reads.

- **Where the body lives**: in the **annotated tag's message**. `release-apk.yml` reads `git tag --format='%(contents:body)'` at CI time and uses that as the GitHub Release body when it auto-publishes the release with the APK attached. Write the body once, at `git tag -a` time, and you're done.
- **Skip a tag**: if a tag never deployed (e.g. v1.6 was killed by a prerender bug), the auto-publish step in CI will fail along with everything else and no release gets created. The follow-up patch (v1.6.1) carries the consolidated notes for both.
- **Structure**: three sections, each on demand.
  - **主要变化** — user-perceivable functional changes and system-level shifts. Each entry includes the design rationale (why this, not that), at the depth of README's "为何不用现有番茄钟 / 代币经济学" sections.
  - **修复** — bug fixes, naming the affected path and who would hit it.
  - **工程** — internal-only changes (test reorgs, CI tweaks, dep bumps).
- **Style**: same Chinese tech writing discipline as README; the AI-tells blacklist in the global `~/.claude/CLAUDE.md` "文档撰写风格" section applies. Don't write "What's Changed" or commit lists.
- **Release notes are for humans, not machines**. Audience is future-you reading the changelog, not a downstream integrator. **Never** drop file paths, KV key shapes, function/action names, schema diffs, internal API surfaces into the release. That precision belongs in commit messages and inline docs. The release narrates the *change to the user's mental model*. 工程 section stays headline-only (test reorg / CI tweak / dep bump), no API catalog.
- **Command** (`--cleanup=verbatim` is **required** — without it git strips every line starting with `#` as a comment, eating the `## 主要变化` / `## 修复` / `## 工程` headings):
  ```bash
  git tag -a v2.X --cleanup=verbatim -m "$(cat <<'EOF'
  v2.X — one-line subject

  ## 主要变化
  ...

  ## 工程
  ...
  EOF
  )"
  git push origin main v2.X
  ```
  CI watches the tag push, builds APK, auto-publishes the GitHub Release with the tag body as the release notes and the arm64-v8a APK attached.
- **Manual override**: if a release already exists for the tag at CI time (rare, for hand-authored notes), the workflow just `gh release upload --clobber` the APK onto it instead of recreating.

## Architecture

### Stack lock-in
- **Next.js 16** App Router (TS, Turbopack default). `node_modules/next/dist/docs/` is the source of truth for v16 API behavior — `cookies()`/`headers()`/`params` are **async**, `middleware.ts` is renamed to `proxy.ts`, and PWA manifest goes in `app/manifest.ts` (native API). Don't trust pre-v16 patterns from training data.
- **React 19** — Server Components are the default; only mark `"use client"` when a file uses state, effects, event handlers, or browser APIs.
- **Tailwind v4** — config-less, theme tokens live in `app/globals.css` `@theme inline {}`. No `tailwind.config.*` file exists.
- **shadcn/ui** ("base-nova" style) on top of Tailwind v4. CLI alias map: `@/components`, `@/lib`, `@/components/ui`. shadcn's semantic tokens (`--background`, `--foreground`, `--primary`, etc.) are **remapped to tokmato's palette** in `globals.css` so any shadcn component renders in our editorial colors automatically.
- **Auth.js v5 (next-auth@beta)** with GitHub OAuth — config in `auth.ts`, route handler in `app/api/auth/[...nextauth]/route.ts`. `SessionProvider` wraps the tree in `components/providers.tsx`. JWT sessions only — no DB adapter.
- **Vercel Marketplace Upstash Redis** for cross-device state sync (env vars `KV_REST_API_URL` / `KV_REST_API_TOKEN`, with `UPSTASH_REDIS_REST_URL/TOKEN` as fallback). Wrapper at `lib/kv.ts`; key namespace via `kvKey.userState(userId)` / `kvKey.pushSubscription(userId)` / `kvKey.pushPending(userId)` / `kvKey.activeSession(userId)`.
- **Upstash QStash** (US region, `qstash-us-east-1.upstash.io`) for delayed delivery of Web Push notifications. Wrapper at `lib/qstash.ts`. Free tier 500 msg/day is plenty for a single user.
- **`web-push`** package for VAPID-signed delivery to FCM / Mozilla Push / APNs. Wrapper at `lib/web-push.ts`.
- **`zod`** for schema validation at trust boundaries (server actions, API routes). Persisted-snapshot schema in `lib/snapshot-schema.ts`.

### Cloud sync — auto-sync via LWW snapshot (v1.6+)
The store still treats `localStorage` as the in-memory source of truth, but signed-in devices now keep cloud and local in step automatically. `app/actions/sync.ts` exposes `saveToCloud(snapshot)` / `loadFromCloud()`; both gate on `auth()` and throw a typed `SyncError` (codes: `UNAUTHENTICATED` / `INVALID_PAYLOAD` / `PAYLOAD_TOO_LARGE` / `RATE_LIMITED`).

- **Trust boundary**: snapshot is treated as untrusted client input. Validated against `persistedSnapshotSchema` (strict — extra keys rejected at the top level), capped at 256 KB pre-parse, rate-limited at 30 saves/min/user via Redis INCR + EXPIRE. There is **no server-side merge** — LWW arbitration runs entirely on the client. (Schema note: only the outer object is `.strict()`; nested `z.object()` accepts unknown fields.)
- **`providers.tsx` runs both halves once the store has hydrated and the user is authenticated**:
  - **Mount-once load**: calls `loadFromCloud()`. If `cloud.savedAt > local.lastSavedAt`, calls `applyCloudSnapshot(snapshot, savedAt)` to overwrite local. Otherwise just `markSynced(savedAt)` so subsequent saves know we're current.
  - **Token-change debounced save**: subscribes to the store and recomputes a `balanceSignature` (ftoken / htoken / timePool / today\* / history-lengths / kanban-lengths). Any signature change kicks a 2 s debounce; on flush, ships `selectSnapshot(state)` then calls `markSynced(result.savedAt)`. Best-effort — failures are swallowed (Settings is the explicit error surface).
- **`lastSavedAt`**: local clock value of the most recent successful save OR the cloud `savedAt` we last loaded. The LWW comparator. `0` = "never synced". `markSynced(t)` advances monotonically (older `t` ignored). `applyCloudSnapshot(snap, savedAt)` replaces state wholesale (uses `DEFAULTS` as the base so a missing field doesn't leak the writer's old value into the new local state).
- **Settings page** is a status row + two **escape hatches**: `立即推送` (force `saveToCloud`) and `立即拉取` (force `loadFromCloud` with confirm). No sync toggle — auto-sync is always on for signed-in users.
- **Welcome bonus**: `providers.tsx` watches `session.user.id` and, once the store is hydrated, calls `grantWelcomeBonus(userId)` exactly once per user (idempotency lives in `welcomeGrantedUserIds` on the persisted state). Don't re-grant from any other surface.
- **Adding a new persistent field**: edit (1) `selectSnapshot` in `lib/store.ts` AND (2) `persistedSnapshotSchema` in `lib/snapshot-schema.ts`. The schema is strict at the top level so a forgotten field rejects the whole snapshot. If the default value can't satisfy older records, bump `persist.version` and add a migrate step.

### Web Push notification chain (`app/actions/push.ts` + `app/api/push/fire/route.ts`)
This is the load-bearing piece for "browser closed → still get notified". The chain is:

```
client startSession
  → startPushChain(boundaryAt = now + 25min, kind = "running-end")
  → QStash holds the message for 25 min
  → POST /api/push/fire (verified via Upstash-Signature)
  → sendWebPush(...) → SW.onpush → showNotification("番茄完成")
  → /api/push/fire schedules the NEXT boundary itself
  → ...continues across phase boundaries without the client being open
```

- **Per-user state in KV**: `push:sub` (the `PushSubscription` JSON) and `push:pending` (`{ messageId, sessionId }` of the in-flight QStash message).
- **Cancellation via sessionId rotation**: `sessionId = String(session.phaseStartedAt)` at the moment `startPushChain` is called. Manual buffer skip mutates `phaseStartedAt`, so a new chain has a different sessionId. The old chain's in-flight QStash callback arrives, finds `pending.sessionId !== payload.sessionId`, and no-ops. `cancelPushChain` deletes `push:pending` outright; either way old callbacks die quietly.
- **Natural advance** (running ↔ buffer auto-flip) happens entirely server-side inside `/api/push/fire` — it preserves the same sessionId, so the chain self-perpetuates. The client only schedules the **first** boundary on session start, and re-schedules on a manual buffer skip.
- **Subscription expiry**: `web-push` returns `{ ok: false, reason: "EXPIRED" }` for 404/410. The route handler drops the `push:sub` key and stops the chain.
- **VAPID keys** generated once via `bunx web-push generate-vapid-keys --json` and stored in env: `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` / `WEB_PUSH_VAPID_SUBJECT`. Public key is also exposed as `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` for the client `pushManager.subscribe()` call.
- **Service worker** at `public/sw.js` — only does push handling and notificationclick → focus existing tab. Do NOT add caching strategies here without thinking about how they interact with the Next.js build pipeline.
- **Platform caveats**: iOS Safari only honors Web Push when tokmato is installed as a PWA (manifest is in place; user has to "add to home screen"). Chrome desktop needs "Continue running background apps" enabled (default on).

### Native FCM transport (v2.3+, `lib/fcm.ts` + `capacitor/`)
The Capacitor Android wrapper at `capacitor/` packages the same Next.js app into a WebView APK and registers a parallel push transport that bypasses Doze on locked screens, which Web Push cannot.

- **Transports run side by side**: `/api/push/fire` reads BOTH `tokmato:user:{id}:push:subs` (Web Push) and `tokmato:user:{id}:fcm:tokens` (FCM) and fans out in parallel. A boundary alert lands on every browser AND every Capacitor device the user has registered. Chain only stops when every transport for this user has expired.
- **Capacitor side stores nothing locally beyond a `tokmato:fcm-token` localStorage marker**. The APK loads `https://tokmato.nihildigit.dev` directly (`server.url` mode), so all UI/state lives on the web side — Capacitor only adds the native push plugin and the WebView shell.
- **`lib/push-client.ts` branches on `window.Capacitor.isNativePlatform()`**: native path calls `Capacitor.Plugins.PushNotifications.register()` and posts the FCM token via `saveFcmToken` server action; web path stays on VAPID + `pushManager.subscribe`. Settings UI uses the same "开启推送" button for both.
- **`lib/fcm.ts` initializes firebase-admin** from `FIREBASE_SERVICE_ACCOUNT_JSON_B64` (base64-encoded service account JSON in env). Returns DISABLED when missing, EXPIRED when the FCM SDK reports `messaging/registration-token-not-registered`. Calls `getMessaging(app).send()` with `android.priority: "high"` + `notification` block — both required to escape Doze.
- **APK build pipeline**: `.github/workflows/release-apk.yml` runs on every `v*` tag, builds an arm64-v8a debug APK in `capacitor/android/app/build/outputs/apk/debug/`, and attaches to the GitHub Release if one already exists (else uploads as workflow artifact). Repo secret `ANDROID_GOOGLE_SERVICES_JSON_BASE64` carries the Firebase Android config that the build needs but is gitignored locally. Release-signed APKs (for Play Store) require generating a keystore + adding 3 more secrets and switching to `assembleRelease` — debug-signed is fine for sideload.
- **Firebase project**: `tokmato-19547`, Android app `dev.nihildigit.tokmato`. Service account email `firebase-adminsdk-fbsvc@tokmato-19547.iam.gserviceaccount.com`.
- **Doze and high-priority Web Push**: Web Push has no high-priority knob; native FCM does. That's the only architectural reason this Capacitor shell exists. Everything else (UI, auth, sync, store) is the same web codebase. See `capacitor/EXPERIMENT.md` for the migration history and what to do next.

### Cross-device read-only awareness (v1.6, `app/actions/active-session.ts`)
A single KV key (`tokmato:user:{id}:active`, 30-min TTL) holds a marker describing the in-progress pomodoro string. Other signed-in devices poll it and render a read-only mirror, naturally blocking double-fire.

- **Writers**: `startSession` and the manual buffer-skip `onContinue` (both in `/home`-side code) write the marker; `endSession`'s `onEnd` clears it. The `/api/push/fire` route also advances the marker on every chain link via `advanceActiveMarker` (read, bump phase, write back), so the originator's tab being closed doesn't stale the marker — the canonical chain keeps it live.
- **Reader**: `useActiveSession` (`lib/use-active-session.ts`) polls every 30 s while foreground + on every `visibilitychange("visible")`. "Self vs other" compares `marker.startedAt === local.session?.startedAt`; only a foreign session bubbles up as `remoteActive`.
- **UI**: on `/home`, `RemoteActiveView` (`components/home/RemoteActiveView.tsx`) replaces the start affordance entirely with a muted timer mirror. On every other route, `RemoteActiveBanner` (`components/layout/RemoteActiveBanner.tsx`) renders a sticky pill at the top of `.page-shell` so the user knows another device is mid-run regardless of which tab they're on. Both render nothing when local is the originator.
- **No heartbeat**: the push chain is the heartbeat. The 30-min TTL means a crashed writer's marker auto-clears within half an hour, which is the worst-case latency for the "phantom lock" failure mode in single-user use.

### Design tokens (single source of truth: `app/globals.css`)
Tokens live as CSS custom properties on `:root` and are exposed to Tailwind via `@theme inline`. The `[data-theme="dark"]` and `.dark` selectors swap the values for warm-dark mode (墨调/深棕, **not** OLED black).

- **Color**: `--paper / --paper-2 / --paper-3 / --ink / --ink-2 / --ink-3 / --ink-mute / --rule / --tomato (FToken / brand) / --sage (HToken) / --teal (time pool) / --gold (math bonus) / --plum (alerts/熬夜)`. Use as Tailwind utilities: `bg-paper text-ink border-rule text-tomato` etc.
- **Type**: `font-serif` (CJKKai → Instrument Serif fallback via unicode-range), `font-kaiti` (CJK only, used when "italic" is wanted on Chinese), `font-sans` (Inter Tight), `font-mono` (JetBrains Mono).
- **Fluid sizes**: `text-display / text-h1 / text-h2 / text-h3 / text-stat / text-balance-num` are all `clamp()`-based — never hardcode px sizes for hero text.
- **Layout**: `--page-pad-x/y`, `--mobile-nav-h`, `--safe-t/r/b/l` (env(safe-area-inset-*)). Every page wraps content in `.page-shell` (handles max-width, fluid padding, safe area, and bottom-nav offset on mobile).

### Tailwind-merge pitfall
`cn()` uses `tailwind-merge`, which **dedupes `text-stat` (font-size token) and `text-tomato` (color token) as conflicting `text-*` utilities** and drops one. When you need both color and size, build the className with a template literal instead of `cn`:
```ts
const valueClass = `serif text-stat leading-none${color ? " " + color : ""}`;
```
Example reference: `app/journey/page.tsx` `BalanceCell`.

### State (Zustand + persist + skipHydration)
`lib/store.ts` is the single in-memory state hub. Schema is `UserState` from `lib/types.ts`.

**Critical**: persist uses `skipHydration: true`. SSR and the very first client render must both see `DEFAULTS`. `components/providers.tsx` runs `useStore.persist.rehydrate()` in a `useEffect` after mount — **do not** read or branch UI on persisted-state until after that effect runs. If a value flips between SSR and client (e.g. `lastSettledDate` → today vs null), you'll get a hydration mismatch.

**Null-safe persist access**: any code that runs during static prerender (initial `useState(...)` values, server components reading client modules) must guard `useStore.persist?.hasHydrated()` with optional chaining and a `?? false` fallback. The persist API namespace is not always attached at prerender time, and a bare `useStore.persist.hasHydrated()` killed the v1.6 build for `/_not-found`.

`todayKey()` in `lib/store.ts` returns the current "tokmato day" — UTC+8 with a **4am cutoff** (so a late-night user can still settle the day they just finished). Use this for any "is today" comparison, never `new Date().toLocaleDateString()`.

The persist version is at `8` — bumping it requires a `migrate` function that handles every prior shape. v1→v2 was `welcomeGrantUserId` → `welcomeGrantedUserIds[]`; v2→v3 added `session.phaseStartedAt`; v3→v4 added `lastSavedAt` for auto-sync LWW arbitration (defaults to `0` = "never synced"); v4→v5 added the now-retired `guideSeenUserIds`; v5→v6 retired `guideSeenUserIds` in favor of a `tokmato:guide-seen` localStorage flag; v6→v7 generalized `todayMathPomos` → `todayCountsByTag` and seeded `tags` + `bonuses` defaults; **v7→v8 was a destructive wipe**: returns `createStarterState()` and clears the per-browser flags (`tokmato:guide-seen`, `tokmato:welcome-granted`), then drops `tokmato:v8-just-upgraded` so a post-hydrate effect in `providers.tsx` can call `cancelPushChain()` + `clearActiveSession()` (otherwise a mid-pomodoro upgrade would orphan the QStash chain and the cross-device active marker).

`selectSnapshot(state)` (exported from `lib/store.ts`) is the single projection used by both `partialize` (localStorage) and `saveToCloud` (KV). Don't roll your own subset — every persisted-shape reader should go through this.

### Page shells & sheet system
- **Routes**: `/home`, `/journey`, `/redeem`, `/kanban`, `/settings`. `/` redirects to `/home`. Layout renders `<RemoteActiveBanner>` (sticky pill, hidden on `/home`) + `<Header>` (desktop top nav, hidden on mobile via `.desktop-only-nav`) + `<MobileTabBar>` (bottom nav, `md:hidden`).
- **Sheets** all use `<ResponsiveSheet>` (`components/ui/responsive-sheet.tsx`) which auto-branches: bottom-sheet on mobile (Radix Sheet), centered modal on desktop (Radix Dialog). When open, it sets `body[data-sheet-open]`, which `globals.css` uses to hide the mobile tab bar so it doesn't peek through. Counter pattern supports nested sheets.
- 9 sheet content components live in `components/sheets/` (Start / Pool / Play / Food / Settle / Notes / AddKanban / AddWish / WishRedeem). All take props + `onConfirm` and call store actions; they don't reach into the store themselves. **Never use `window.prompt`/`window.confirm` for in-app input** — wrap a sheet instead. (See `AddKanbanSheet` for the reference pattern.)

### Pomodoro & entertainment session lifecycle (clock-based)
**Display time is computed every render from `Date.now() - phaseStartedAt`.** Never decrement a counter via `setInterval` — that drifts under tab throttling and resets on remount. The 250 ms tick only triggers a re-render; the actual time math reads wall-clock.

- **`PomodoroSession`** carries `startedAt` (immutable session start), `phaseStartedAt` (current phase start, mutates on each transition), `mode` (`"running" | "buffer"`), and `count` (1-based). All persisted in localStorage so a reload preserves position.
- **`advancePomodoroPhase({ manual?, now? })`** in the store handles transitions:
  - Natural: only no-ops until `now >= phaseStartedAt + duration`. Bumps `phaseStartedAt` by `duration`. After running → buffer keeps count; after buffer → running increments count.
  - `manual: true` (user clicks "继续下一个" during buffer): sets `phaseStartedAt = now` so the next pomodoro starts from the click moment, not from when buffer would have ended.
  - Crossed multiple boundaries during a sleep? The auto-advance useEffect calls it repeatedly each tick until caught up.
- **`RunningView`** (`components/home/RunningView.tsx`) uses `Date.now()` ticks + `visibilitychange`/`focus`/`pageshow` resync. On boundary cross it (a) fires a foreground `Notification` if permission granted, and (b) calls `advancePomodoroPhase`. Long-press end is a **deliberate cut-off, no confetti** (per design feedback). Triggers `NotesSheet` review if there are notes, then `endSession`.
- **`PlaySession`** (`playSession` in store): started by `PlaySheet` → `EntertainmentRunningView` (`components/play/EntertainmentRunningView.tsx`) renders as a **full-screen overlay mounted in `<Providers>`** so it covers any tab. Time-pool minutes are deducted upfront on `startPlay`; long-press end refunds remaining minutes via `endPlay({ refundMinutes })`. Same wall-clock-based timer pattern as `RunningView`.
- **Push chain integration**: `startSession` and the manual buffer-skip `onContinue` both call `startPushChain` to (re)schedule the next server-side boundary notification, AND `setActiveSession(...)` to (re)write the cross-device awareness marker. `endSession` calls `cancelPushChain` and `clearActiveSession`. See the Web Push and Cross-device awareness sections above.

### Kanban (the one tab with deep mobile interaction)
- **Desktop** (`md:flex`): inbox row + 2×2 quadrant grid, HTML5 drag-and-drop, drop indicator highlights the entire target column.
- **Mobile** (`md:hidden`): segmented tab strip across top (5 columns), single column body. Cards are moved via a **gestural radial menu**: long-press 360 ms triggers an SVG overlay anchored at the touch point with a connecting line that follows the finger; pulling past a 28 px dead-zone snaps to one of 5 destination chips (↑Q1 / →Q2 / ↓Q3 / ←Q4 / center=Inbox). Implemented inline at the bottom of `app/kanban/page.tsx` (`RadialMoveMenu`).
- "新任务" opens `AddKanbanSheet` (replaces a legacy `window.prompt`).

## Project conventions to enforce

- **No raw hex / oklch / rgba in component code** — always go through a CSS variable in `globals.css`. Even one-off colors (gradients, SVG fills) get a token.
- **No marketing副文** (per `.impeccable.md` principle 1 "诚实大于优雅"). Every line of UI text must be either functional info or named action. Examples of what gets cut: dot-separated AI-style taglines, explainer subtitles under section titles, redundant bilingual labels (e.g. "Settings / 设置" together — pick one).
- **Section head = kicker XOR title**, not both unless the kicker is a real category (temporal scope / axis label) not a paraphrase. 反例：kicker `30 天账本` + title `花到哪了`（两层同义，删 title）。可接受：kicker `30 天` + title `账本`（前者是范围，后者是功能名）。
- **`·` is punctuation, not decoration** — middle dot separates equivalent inline items (`F · H · 时间池` / `保存 · 取消`). 永不用来粘连"概念 · 解释"。反例：`账本 · 含进项与消费`、`番茄换娱乐时间 · 约束消遣`、`先看这一页 · 之后从设置可再次打开`。第二段若是第一段的注释、扩写或同义重述，删第二段。
- **Daily hero size is `text-h2` max**. `text-display` (clamp 48-88) is reserved for once-a-year emotional peaks (year-end review, settlement celebration). Home / Redeem hero never use it.
- **Above-the-fold density**: each route's first viewport must surface ≥3 independent functional chunks (card / strip / row). No giant centered headline that owns the whole screen.
- **CJK italic = 楷体, never browser-faked oblique**. `font-synthesis: none` is set globally; the `font-serif` stack puts CJKKai (with `unicode-range: U+3000-9FFF`) in front of Instrument Serif so Latin text gets real italic and Chinese gets 楷体.
- **Mobile tab labels match desktop** (currently English: Home / Journey / Redeem / Kanban / Settings).

## Testing notes

Layout (`bun test` discovery):
- `lib/store.test.ts` — pure unit tests of the Zustand store (in-memory localStorage stub).
- `lib/utils.test.ts` — single regression test pinning the tailwind-merge pitfall above.
- `lib/snapshot-schema.test.ts` — pure unit tests of the persist/cloud-sync schema (boundaries, strictness, lastSavedAt presence).
- `lib/qstash.test.ts` — smoke against real Upstash QStash (publish + immediate cancel).
- `lib/web-push.test.ts` — smoke against real VAPID delivery to a bogus endpoint, plus the `DISABLED` branch when env is wiped.
- `app/actions/sync.test.ts` — smoke against real Upstash Redis; mocks **only** `@/auth`. Namespace `tokmato:user:test-sync:*`.
- `app/actions/push.test.ts` — smoke against real Redis + QStash. Namespace `tokmato:user:test-smoke:*`. Includes a sessionId-rotation case for `startPushChain`.
- `app/actions/active-session.test.ts` — smoke against real Redis. Namespace `tokmato:user:test-active:*`.

Conventions:
- **`bun run test`** loads `.env.local` (via `--env-file`) so smoke tests hit real Upstash. Plain `bun test path/...` does NOT.
- **`describeIf(hasEnv ? describe : describe.skip)` pattern** — smoke tests gracefully skip when env isn't present (e.g. CI without secrets). Don't write smoke tests that throw on missing env.
- **Module mocks pollute across files**. `bun:test`'s `mock.module(...)` is process-global; every test file that mocks `@/auth` or `@/lib/kv` must keep its mock shape in sync with the real module's exports, otherwise sibling files load the partial mock and crash.
- **Smoke namespace cleanup**: every smoke test that writes to KV must `await cleanup()` in `beforeEach` AND `afterAll` to keep the dashboard tidy.
- **Cost**: a CI run executes a few Upstash commands and one or two QStash publish/cancel pairs — well under the free tier ceiling.

## Multi-agent workflow notes

This project was built largely by spawning parallel `general-purpose` Agent subagents — one per page during the page pass, one per sheet during the sheet pass, etc. When an agent writes a sheet or page, give it: the file path to mirror, a pointer to `.impeccable.md`, and the design vocabulary range to stay inside (text-h2 max, smallcaps for kickers, no marketing副文). Agents that don't read `.impeccable.md` will reintroduce naked hex and AI-flavored taglines.
