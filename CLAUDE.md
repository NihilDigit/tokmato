# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Note: `AGENTS.md` in this repo is a symlink to this file, so AGENTS-aware tools (Cursor, Aider, etc.) read the same content.

## ⚠ Next.js 16 — heads-up

This repo uses Next.js 16 with React 19. Several APIs differ from anything in pre-2026 training data: `cookies()` / `headers()` / route `params` are **async**, `middleware.ts` is renamed to `proxy.ts`, PWA manifest goes in `app/manifest.ts` (native), and Turbopack is the default bundler. The bundled docs at `node_modules/next/dist/docs/` are the source of truth — read the relevant guide before writing anything new and heed deprecation notices.

## What this is

**tokmato** — a personal token-economy app for a single user (考研 student, ADHD-leaning). Pomodoro sessions earn FToken (Focus) and HToken (Health); tokens spend into a time pool that funds entertainment / food / wishlist redemption. Deployed to Vercel at https://tokmato.nihildigit.dev. Also installable as a PWA (manifest + icons in place).

The design constitution lives in `.impeccable.md` — **must-read**. It sets brand voice, palette, info density rules ("杂志调、app 骨"), and what to never do (no marketing副文 / no fake CJK italic / no naked hex).

## Commands

```bash
bun run dev          # Start dev server (Turbopack, port 3000)
bun run build        # Production build + TS typecheck (run before any deploy)
bun run start        # Serve production build

# Vercel (already linked to nihildigits-projects-daf2fe15/tokmato)
bunx vercel dev                       # Local with Vercel env injected
bunx vercel deploy --prod             # Deploy to production
bunx vercel env pull .env.local --yes # Sync remote env to local

# Add shadcn primitives
bunx --bun shadcn@latest add <component>
```

There is no test suite yet. Verification is browser-based — run `bun run build` to catch type errors and prerender failures.

## Architecture

### Stack lock-in
- **Next.js 16** App Router (TS, Turbopack default). `node_modules/next/dist/docs/` is the source of truth for v16 API behavior — `cookies()`/`headers()`/`params` are **async**, `middleware.ts` is renamed to `proxy.ts`, and PWA manifest goes in `app/manifest.ts` (native API). Don't trust pre-v16 patterns from training data.
- **React 19** — Server Components are the default; only mark `"use client"` when a file uses state, effects, event handlers, or browser APIs.
- **Tailwind v4** — config-less, theme tokens live in `app/globals.css` `@theme inline {}`. No `tailwind.config.*` file exists.
- **shadcn/ui** ("base-nova" style) on top of Tailwind v4. CLI alias map: `@/components`, `@/lib`, `@/components/ui`. shadcn's semantic tokens (`--background`, `--foreground`, `--primary`, etc.) are **remapped to tokmato's palette** in `globals.css` so any shadcn component renders in our editorial colors automatically.
- **Auth.js v5 (next-auth@beta)** with GitHub OAuth — config in `auth.ts`, route handler in `app/api/auth/[...nextauth]/route.ts`. `SessionProvider` wraps the tree in `components/providers.tsx`.
- **Vercel Marketplace Upstash Redis** for cross-device state sync (env vars `KV_REST_API_URL` / `KV_REST_API_TOKEN`, with `UPSTASH_REDIS_REST_URL/TOKEN` as fallback). Wrapper at `lib/kv.ts`; key namespace via `kvKey.userState(userId)`. The store still treats `localStorage` as the source of truth — cloud sync is **manual save/load**, not auto-merge.

### Auth & cloud sync flow
- **Server actions** (`app/actions/sync.ts`): `saveToCloud(snapshot)` and `loadFromCloud()` are the only paths to KV. Both gate on `auth()` and throw `UNAUTHENTICATED` if there's no session. There is **no server-side merge** — the user picks the direction in `/settings` (Save / Load buttons).
- **Welcome bonus**: `providers.tsx` watches `session.user.id` and, once the store is hydrated, calls `grantWelcomeBonus(userId)` exactly once per user (idempotency lives in `welcomeGrantedUserIds` on the persisted state — see `lib/store.ts`). Don't re-grant from any other surface.
- The persisted snapshot shape is whatever `partialize` exposes in `lib/store.ts`; if you add new state, decide explicitly whether it ships to KV.

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
`lib/store.ts` is the single in-memory state hub. Schema is `UserState` from `lib/types.ts` (token balances, current pomodoro/play sessions, wishlist, achievements, kanban, recent tasks, lastSettledDate).

**Critical**: persist uses `skipHydration: true`. SSR and the very first client render must both see `DEFAULTS`. `components/providers.tsx` runs `useStore.persist.rehydrate()` in a `useEffect` after mount — **do not** read or branch UI on persisted-state until after that effect runs. If a value flips between SSR and client (e.g. `lastSettledDate` → today vs null), you'll get a hydration mismatch.

`todayKey()` in `lib/store.ts` returns the current "tokmato day" — UTC+8 with a **4am cutoff** (so a late-night user can still settle the day they just finished). Use this for any "is today" comparison, never `new Date().toLocaleDateString()`.

### Page shells & sheet system
- **Routes**: `/home`, `/journey`, `/redeem`, `/kanban`, `/settings`. `/` redirects to `/home`. Layout renders `<Header>` (desktop top nav, hidden on mobile via `.desktop-only-nav`) + `<MobileTabBar>` (bottom nav, `md:hidden`).
- **Sheets** all use `<ResponsiveSheet>` (`components/ui/responsive-sheet.tsx`) which auto-branches: bottom-sheet on mobile (Radix Sheet), centered modal on desktop (Radix Dialog). When open, it sets `body[data-sheet-open]`, which `globals.css` uses to hide the mobile tab bar so it doesn't peek through. Counter pattern supports nested sheets.
- 6 sheet content components live in `components/sheets/` (Start / Pool / Play / Food / Settle / Notes). They take props + `onConfirm` and call store actions; they don't reach into the store themselves.

### Pomodoro & entertainment session lifecycle
- **PomodoroSession** (`session` in store): started by `StartSheet` → `RunningView` (`components/home/RunningView.tsx`) takes over the entire `/home` page when `session != null`. State machine: `running` (25 min) → `buffer` (60s) → auto-continues. Long-press end is a **deliberate cut-off, no confetti** (per design feedback). Triggers `NotesSheet` review if there are notes, then `endSession` (which awards F + bumps `todayPomos`/`todayMathPomos`).
- **PlaySession** (`playSession` in store): started by `PlaySheet` → `EntertainmentRunningView` (`components/play/EntertainmentRunningView.tsx`) renders as a **full-screen overlay mounted in `<Providers>`** so it covers any tab. Time-pool minutes are deducted upfront on `startPlay`; long-press end refunds remaining minutes via `endPlay({refundMinutes})`.

### Kanban (the one tab with deep mobile interaction)
- **Desktop** (`md:flex`): inbox row + 2×2 quadrant grid, HTML5 drag-and-drop, drop indicator highlights the entire target column.
- **Mobile** (`md:hidden`): segmented tab strip across top (5 columns), single column body. Cards are moved via a **gestural radial menu**: long-press 360ms triggers an SVG overlay anchored at the touch point with a connecting line that follows the finger; pulling past a 28px dead-zone snaps to one of 5 destination chips (↑Q1 / →Q2 / ↓Q3 / ←Q4 / center=Inbox). Implemented inline at the bottom of `app/kanban/page.tsx` (`RadialMoveMenu`).

## Project conventions to enforce

- **No raw hex / oklch / rgba in component code** — always go through a CSS variable in `globals.css`. Even one-off colors (gradients, SVG fills) get a token.
- **No marketing副文** (per `.impeccable.md` principle 1 "诚实大于优雅"). Every line of UI text must be either functional info or named action. Examples of what gets cut: dot-separated AI-style taglines (`"时间池 · 易逝"`, `"诚实大于优雅 · 数据自带多巴胺"`), explainer subtitles under section titles, redundant bilingual labels (e.g. "Settings / 设置" together — pick one).
- **Daily hero size is `text-h2` max**. `text-display` (clamp 48-88) is reserved for once-a-year emotional peaks (year-end review, settlement celebration). Home / Redeem hero never use it.
- **Above-the-fold density**: each route's first viewport must surface ≥3 independent functional chunks (card / strip / row). No giant centered headline that owns the whole screen.
- **CJK italic = 楷体, never browser-faked oblique**. `font-synthesis: none` is set globally; the `font-serif` stack puts CJKKai (with `unicode-range: U+3000-9FFF`) in front of Instrument Serif so Latin text gets real italic and Chinese gets 楷体.
- **Mobile tab labels match desktop** (currently English: Home / Journey / Redeem / Kanban / Settings).

## Multi-agent workflow notes

This project was built largely by spawning parallel `general-purpose` Agent subagents — one per page during the page pass, one per sheet during the sheet pass, etc. When an agent writes a sheet or page, give it: the file path to mirror, a pointer to `.impeccable.md`, and the design vocabulary range to stay inside (text-h2 max, smallcaps for kickers, no marketing副文). Agents that don't read `.impeccable.md` will reintroduce naked hex and AI-flavored taglines.
