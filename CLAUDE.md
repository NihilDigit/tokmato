# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Note: `AGENTS.md` in this repo is a symlink to this file, so AGENTS-aware tools (Cursor, Aider, etc.) read the same content.

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

Production deploys are triggered by pushing a `v*` tag — `.github/workflows/release-deploy.yml` builds and ships via `vercel deploy --prebuilt --prod`. Don't deploy from a local working tree if the goal is a tagged release; tag and push instead.

## Architecture

### Stack lock-in
- **Next.js 16** App Router (TS, Turbopack default). `node_modules/next/dist/docs/` is the source of truth for v16 API behavior — `cookies()`/`headers()`/`params` are **async**, `middleware.ts` is renamed to `proxy.ts`, and PWA manifest goes in `app/manifest.ts` (native API). Don't trust pre-v16 patterns from training data.
- **React 19** — Server Components are the default; only mark `"use client"` when a file uses state, effects, event handlers, or browser APIs.
- **Tailwind v4** — config-less, theme tokens live in `app/globals.css` `@theme inline {}`. No `tailwind.config.*` file exists.
- **shadcn/ui** ("base-nova" style) on top of Tailwind v4. CLI alias map: `@/components`, `@/lib`, `@/components/ui`. shadcn's semantic tokens (`--background`, `--foreground`, `--primary`, etc.) are **remapped to tokmato's palette** in `globals.css` so any shadcn component renders in our editorial colors automatically.
- **Auth.js v5 (next-auth@beta)** with GitHub OAuth — config in `auth.ts`, route handler in `app/api/auth/[...nextauth]/route.ts`. `SessionProvider` wraps the tree in `components/providers.tsx`.
- **Vercel Marketplace Upstash Redis** for cross-device state sync (env vars `KV_REST_API_URL` / `KV_REST_API_TOKEN`, with `UPSTASH_REDIS_REST_URL/TOKEN` as fallback). Wrapper at `lib/kv.ts`; key namespace via `kvKey.userState(userId)`. The store still treats `localStorage` as the source of truth — cloud sync is **manual save/load**, not auto-merge.
- **Upstash QStash** (US region, `qstash-us-east-1.upstash.io`) for delayed delivery of Web Push notifications. Wrapper at `lib/qstash.ts`. Free tier 500 msg/day is plenty for a single user.
- **`web-push`** package for VAPID-signed delivery to FCM / Mozilla Push / APNs. Wrapper at `lib/web-push.ts`.
- **`zod`** for schema validation at trust boundaries (server actions, API routes). Persisted-snapshot schema in `lib/snapshot-schema.ts`.

### Auth & cloud sync flow (`app/actions/sync.ts`)
- `saveToCloud(snapshot)` and `loadFromCloud()` are the only paths to KV. Both gate on `auth()` and throw a typed `SyncError` (codes: `UNAUTHENTICATED` / `INVALID_PAYLOAD` / `PAYLOAD_TOO_LARGE` / `RATE_LIMITED`).
- **Trust boundary**: snapshot is treated as untrusted client input. Validated against `persistedSnapshotSchema` (strict — extra keys rejected), capped at 256 KB pre-parse, rate-limited at 30 saves/min/user via Redis INCR + EXPIRE. There is **no server-side merge** — the user picks the direction in `/settings` (Save / Load).
- **Welcome bonus**: `providers.tsx` watches `session.user.id` and, once the store is hydrated, calls `grantWelcomeBonus(userId)` exactly once per user (idempotency lives in `welcomeGrantedUserIds` on the persisted state — see `lib/store.ts`). Don't re-grant from any other surface.
- The persisted snapshot shape is whatever `partialize` exposes in `lib/store.ts`. If you add new state, decide explicitly whether it ships to KV, then update both `partialize` AND `persistedSnapshotSchema` — the schema is strict, so a forgotten field will reject the whole snapshot.

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

`todayKey()` in `lib/store.ts` returns the current "tokmato day" — UTC+8 with a **4am cutoff** (so a late-night user can still settle the day they just finished). Use this for any "is today" comparison, never `new Date().toLocaleDateString()`.

The persist version is at `3` — bumping it requires a `migrate` function that handles every prior shape. v1→v2 was `welcomeGrantUserId` → `welcomeGrantedUserIds[]`; v2→v3 added `session.phaseStartedAt`.

### Page shells & sheet system
- **Routes**: `/home`, `/journey`, `/redeem`, `/kanban`, `/settings`. `/` redirects to `/home`. Layout renders `<Header>` (desktop top nav, hidden on mobile via `.desktop-only-nav`) + `<MobileTabBar>` (bottom nav, `md:hidden`).
- **Sheets** all use `<ResponsiveSheet>` (`components/ui/responsive-sheet.tsx`) which auto-branches: bottom-sheet on mobile (Radix Sheet), centered modal on desktop (Radix Dialog). When open, it sets `body[data-sheet-open]`, which `globals.css` uses to hide the mobile tab bar so it doesn't peek through. Counter pattern supports nested sheets.
- 7 sheet content components live in `components/sheets/` (Start / Pool / Play / Food / Settle / Notes / AddKanban / AddWish / WishRedeem). All take props + `onConfirm` and call store actions; they don't reach into the store themselves. **Never use `window.prompt`/`window.confirm` for in-app input** — wrap a sheet instead. (See `AddKanbanSheet` for the reference pattern; the kanban "新任务" flow used to use `window.prompt` and got migrated.)

### Pomodoro & entertainment session lifecycle (clock-based)
**Display time is computed every render from `Date.now() - phaseStartedAt`.** Never decrement a counter via `setInterval` — that drifts under tab throttling and resets on remount. The 250ms tick only triggers a re-render; the actual time math reads wall-clock.

- **`PomodoroSession`** carries `startedAt` (immutable session start), `phaseStartedAt` (current phase start, mutates on each transition), `mode` (`"running" | "buffer"`), and `count` (1-based). All persisted in localStorage so a reload preserves position.
- **`advancePomodoroPhase({ manual?, now? })`** in the store handles transitions:
  - Natural: only no-ops until `now >= phaseStartedAt + duration`. Bumps `phaseStartedAt` by `duration`. After running → buffer keeps count; after buffer → running increments count.
  - `manual: true` (user clicks "继续下一个" during buffer): sets `phaseStartedAt = now` so the next pomodoro starts from the click moment, not from when buffer would have ended.
  - Crossed multiple boundaries during a sleep? The auto-advance useEffect calls it repeatedly each tick until caught up.
- **`RunningView`** (`components/home/RunningView.tsx`) uses `Date.now()` ticks + `visibilitychange`/`focus`/`pageshow` resync. On boundary cross it (a) fires a foreground `Notification` if permission granted, and (b) calls `advancePomodoroPhase`. Long-press end is a **deliberate cut-off, no confetti** (per design feedback). Triggers `NotesSheet` review if there are notes, then `endSession`.
- **`PlaySession`** (`playSession` in store): started by `PlaySheet` → `EntertainmentRunningView` (`components/play/EntertainmentRunningView.tsx`) renders as a **full-screen overlay mounted in `<Providers>`** so it covers any tab. Time-pool minutes are deducted upfront on `startPlay`; long-press end refunds remaining minutes via `endPlay({ refundMinutes })`. Same wall-clock-based timer pattern as `RunningView`.
- **Push chain integration**: `startSession` and the manual buffer-skip `onContinue` both call `startPushChain` to (re)schedule the next server-side boundary notification. `endSession` calls `cancelPushChain`. See the Web Push section above for why this is server-side.

### Kanban (the one tab with deep mobile interaction)
- **Desktop** (`md:flex`): inbox row + 2×2 quadrant grid, HTML5 drag-and-drop, drop indicator highlights the entire target column.
- **Mobile** (`md:hidden`): segmented tab strip across top (5 columns), single column body. Cards are moved via a **gestural radial menu**: long-press 360ms triggers an SVG overlay anchored at the touch point with a connecting line that follows the finger; pulling past a 28px dead-zone snaps to one of 5 destination chips (↑Q1 / →Q2 / ↓Q3 / ←Q4 / center=Inbox). Implemented inline at the bottom of `app/kanban/page.tsx` (`RadialMoveMenu`).
- "新任务" opens `AddKanbanSheet` (replaces the legacy `window.prompt`).

## Project conventions to enforce

- **No raw hex / oklch / rgba in component code** — always go through a CSS variable in `globals.css`. Even one-off colors (gradients, SVG fills) get a token.
- **No marketing副文** (per `.impeccable.md` principle 1 "诚实大于优雅"). Every line of UI text must be either functional info or named action. Examples of what gets cut: dot-separated AI-style taglines, explainer subtitles under section titles, redundant bilingual labels (e.g. "Settings / 设置" together — pick one).
- **Daily hero size is `text-h2` max**. `text-display` (clamp 48-88) is reserved for once-a-year emotional peaks (year-end review, settlement celebration). Home / Redeem hero never use it.
- **Above-the-fold density**: each route's first viewport must surface ≥3 independent functional chunks (card / strip / row). No giant centered headline that owns the whole screen.
- **CJK italic = 楷体, never browser-faked oblique**. `font-synthesis: none` is set globally; the `font-serif` stack puts CJKKai (with `unicode-range: U+3000-9FFF`) in front of Instrument Serif so Latin text gets real italic and Chinese gets 楷体.
- **Mobile tab labels match desktop** (currently English: Home / Journey / Redeem / Kanban / Settings).

## Testing notes

- **`bun run test`** loads `.env.local` (via `--env-file`) so smoke tests can hit real Upstash Redis + QStash. Plain `bun test path/...` does NOT.
- **`describeIf(hasEnv ? describe : describe.skip)` pattern** — smoke tests gracefully skip when env isn't present (e.g., in CI without secrets).
- **Module mocks pollute across files**. `bun:test`'s `mock.module(...)` is process-global; once a test file mocks `@/lib/kv`, every later file that imports it sees the mock. If you add new keys to `kvKey`, update the mock in `app/actions/sync.test.ts` to keep the full shape — otherwise other test files fail with "kvKey.X is not a function".
- Smoke tests under `app/actions/push.test.ts` and `lib/qstash.test.ts` write to a `test-smoke` user namespace and clean up in `afterAll`. They run real QStash publish + cancel pairs (fire URL is `example.com`, never delivered — we cancel within ms). Cost: a couple of QStash messages per CI run.

## Multi-agent workflow notes

This project was built largely by spawning parallel `general-purpose` Agent subagents — one per page during the page pass, one per sheet during the sheet pass, etc. When an agent writes a sheet or page, give it: the file path to mirror, a pointer to `.impeccable.md`, and the design vocabulary range to stay inside (text-h2 max, smallcaps for kickers, no marketing副文). Agents that don't read `.impeccable.md` will reintroduce naked hex and AI-flavored taglines.
