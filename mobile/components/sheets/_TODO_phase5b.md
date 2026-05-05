# Phase 5b — sheets pending direct port

> 2026-05-05: M1 + M2 sheets ported. Ledger / WelcomeGuide remain
> deferred — see "Deferred" below.

## Done

| Sheet | Status |
|---|---|
| `StartSheet` | Phase 5 |
| `NotesSheet` | Phase 5 |
| `AddKanbanSheet` | Phase 5 |
| `PoolSheet` | Phase 5 |
| `WishRedeemSheet` | Phase 5 |
| `PlaySheet` + `EntertainmentRunningView` | Phase 5b |
| `SettleSheet` | Phase 5b (single-page form, web's 4-step stepper collapsed) |
| `AddWishSheet` | Phase 5b |
| `KanbanCardSheet` | Phase 5b (edit + delete; add still goes through `AddKanbanSheet`) |
| `FoodSheet` | Phase 5b |
| `EditTagSheet` | Phase 5b |
| `EditBonusSheet` | Phase 5b |

## Deferred

| Sheet | Why deferred | Mitigation |
|---|---|---|
| `LedgerSheet` | Web's drilldown filter view. Mobile's Journey screen renders the same ledger via FlashList; the deeper filtering is rarely used and the web UI handles it. | Use Journey screen; cloud-sync round-trips full history. |
| `WelcomeGuideSheet` | First-run 3-page swiper. Mobile-first users are rare — typical onboarding goes web first, then add-to-home or APK install. The web guide already gates per browser. | Web does first-run. Mobile users see populated state immediately after sign-in via cloud-load. |

## Pattern reminder

Every sheet:
1. Use the `Sheet` primitive (`./Sheet.tsx`).
2. Read state via `useStore((s) => ...)` — never reach into AsyncStorage / native APIs.
3. Call store actions on confirm; never write to KV directly (auto-save subscriber in `lib/cloud-sync.ts` handles persistence).
4. Use `<EditorialText>` for all visible strings — never raw `<Text>` with hardcoded `fontFamily`.
5. Use `theme.color.*` from `useTheme()` — never hex literals.
