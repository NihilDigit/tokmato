# Phase 5b — sheets pending direct port

Phase 5 shipped the critical-path sheets (StartSheet, NotesSheet,
AddKanbanSheet, PoolSheet, WishRedeemSheet) plus the Radial move
gesture for kanban. The sheets below are **stubs**: web users still
have full functionality on `tokmato.nihildigit.dev`, and the cloud-sync
debounced save means anything created on web shows up on mobile. They
need direct ports before mobile is a full first-class client.

| Sheet | Web reference | Mobile status | Notes |
|---|---|---|---|
| `SettleSheet` | `components/sheets/SettleSheet.tsx` | TODO | Daily settle dialog: shows F/H/pool delta, awards H bonus on streak. Uses store actions `settleDay()`. |
| `PlaySheet` | `components/sheets/PlaySheet.tsx` | TODO | Entertainment session start: pick type / duration / cost. Calls `startPlay`. The actual fullscreen overlay (`EntertainmentRunningView`) follows the same wall-clock pattern as `RunningView` so the port is ~80% mechanical. |
| `AddWishSheet` | `components/sheets/AddWishSheet.tsx` | TODO | Add a wishlist item — name, price, pay mode (F/H/mixed), color. |
| `EditTagSheet` | `components/sheets/EditTagSheet.tsx` | TODO | CRUD on tags. Includes color picker. |
| `EditBonusSheet` | `components/sheets/EditBonusSheet.tsx` | TODO | CRUD on bonus tiers (e.g. "5个math 番茄送 1F"). |
| `FoodSheet` | `components/sheets/FoodSheet.tsx` | TODO | Track food consumption — calls `consumeFood` action with H spend. |
| `LedgerSheet` | `components/sheets/LedgerSheet.tsx` | TODO | Detailed ledger with filters. Journey screen already has FlashList ledger; this is the deeper drilldown. |
| `WelcomeGuideSheet` | `components/sheets/WelcomeGuideSheet.tsx` | TODO | First-run onboarding — 3-page swiper. Gated by `tokmato:guide-seen` flag in storage-port. |
| `KanbanCardSheet` | `components/sheets/KanbanCardSheet.tsx` | TODO | Tap-to-edit existing card. CRUD on `name` + `next`. The kanban screen currently has tap as no-op; long-press triggers radial move. |

## Pattern to follow

Every sheet should:
1. Use the existing `Sheet` primitive (`./Sheet.tsx`).
2. Read state via `useStore((s) => ...)` — never reach into `localStorage` or DOM.
3. Call store actions on confirm; never write to KV directly (the auto-sync subscriber in `lib/cloud-sync.ts` handles that).
4. Use `<EditorialText>` for all visible strings — never raw `<Text>` with hardcoded `fontFamily`.
5. Use `theme.color.*` from `useTheme()` — never hex literals.

## Estimated remaining work

Each sheet is 100-200 lines of RN that mirrors the web TSX. The
mechanical part (store calls, validation) is already in `shared/store.ts`.
The visual part is editorial polish + form layout. Fluid sizing via
`fluid()` from `tokens.ts` keeps the type scale honest.

Total: ~1500 lines of RN, ~2 days focused work for one engineer.
