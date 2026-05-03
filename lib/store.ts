"use client";

/**
 * tokmato Zustand store — single source of truth for user state.
 *
 * Phase 5 (current): localStorage persist via zustand/middleware/persist.
 * Phase 6 (future): adds bidirectional KV sync layer (Upstash Redis via
 * Server Actions / API route) — same store API, just wraps the storage
 * adapter. Replace `createJSONStorage(() => localStorage)` with a
 * KV-backed storage when auth is wired up.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  UserState,
  KanbanCard,
  KanbanColumnId,
  PomodoroSession,
  PlaySession,
  PlayType,
  FoodPreset,
  TagId,
  TagConfig,
  TagColor,
  BonusConfig,
  SessionType,
  PomodoroRecord,
  TokenLedgerEntry,
} from "./types";
import { totalBonusF } from "./bonus";

// ─────────────────────────────────────────────────────────────────────────
// Defaults — first-run starter state; once user has data in storage, this is unused.
// ─────────────────────────────────────────────────────────────────────────
const WELCOME_FTOKEN = 5;
const WELCOME_HTOKEN = 10;

/** Default tag set — matches the v1.7 hardcoded list, with one color
 *  assigned per tag from the 10-color palette. Preserved on migration
 *  so existing histories (which reference tag ids by string) keep working. */
const DEFAULT_TAGS: TagConfig[] = [
  { id: "cs", label: "#cs", color: "slate" },
  { id: "math", label: "#math", color: "tomato" },
  { id: "english", label: "#english", color: "sage" },
  { id: "others", label: "#others", color: "gold" },
  { id: "trash", label: "#trash", color: "plum" },
];

/** Default bonus set — replicates the v1.7 hardcoded math 5/7/9/11
 *  ladder (threshold 5, step 2, +1 F per tier), now extrapolated past 11
 *  per the v1.8 unbounded design. */
const DEFAULT_BONUSES: BonusConfig[] = [
  {
    id: "b-default-math",
    tagId: "math",
    threshold: 5,
    initialReward: 1,
    step: 2,
    stepReward: 1,
  },
];

function createStarterState(): UserState {
  return {
    ftoken: 0,
    htoken: 0,
    timePool: 0,
    lastSettledDate: null,
    activeDay: todayKey(),
    session: null,
    playSession: null,
    todayPomos: 0,
    todayCountsByTag: {},
    todayFGained: 0,
    todayHGained: 0,
    todayPoolGained: 0,
    tags: DEFAULT_TAGS.map((t) => ({ ...t })),
    bonuses: DEFAULT_BONUSES.map((b) => ({ ...b })),
    lastSavedAt: 0,
    pomodoroHistory: [],
    tokenHistory: [],
    wishlist: [],
    achievements: [],
    kanban: {
      inbox: [],
      Q1: [],
      Q2: [],
      Q3: [],
      Q4: [],
    },
    recentTasks: [],
    foodPresets: [
      { id: "fp1", name: "可乐", price: 3.5 },
      { id: "fp2", name: "雪糕", price: 5 },
    ],
  };
}

const DEFAULTS: UserState = createStarterState();

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Day key for settle gating, with 4am UTC+8 cutoff. Anything before 4am
 *  counts as the previous day (so a late-night user can still settle the
 *  day they just finished). */
export function todayKey(now: Date = new Date()): string {
  // UTC+8 epoch ms
  const utc8 = now.getTime() + 8 * 3600 * 1000;
  // Shift another -4h so 4am becomes the day boundary
  const shifted = utc8 - 4 * 3600 * 1000;
  const d = new Date(shifted);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "Yesterday" relative to wall clock — the same UTC+8/4am-cutoff bucket
 *  that contained 24h ago. Used by SettleSheet to surface the day being
 *  reviewed (the dominant entry point is "morning after" wake-up). */
export function yesterdayKey(now: Date = new Date()): string {
  return todayKey(new Date(now.getTime() - 24 * 3600 * 1000));
}

const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
const clamp = (v: number, lo = 0, hi = Infinity) => Math.max(lo, Math.min(hi, v));

function normalizeDay(s: Store): Partial<UserState> {
  const nextDay = todayKey();
  const activeDay = s.activeDay;
  if (!activeDay) {
    return {
      activeDay: nextDay,
      todayPomos: 0,
      todayCountsByTag: {},
      todayFGained: 0,
      todayHGained: 0,
      todayPoolGained: 0,
    };
  }
  if (activeDay === nextDay) return {};
  return {
    activeDay: nextDay,
    todayPomos: 0,
    todayCountsByTag: {},
    todayFGained: 0,
    todayHGained: 0,
    todayPoolGained: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────

interface StoreActions {
  // Settlement
  settle: (data: { fGained: number; hGained: number }) => void;
  ensureToday: () => void;
  /** Grant the +5F/+10H welcome bonus once. v9+ idempotency lives on a
   *  per-browser localStorage flag in providers.tsx; this action just
   *  applies the bonus + writes a `kind:"welcome"` ledger entry whenever
   *  called. The caller is responsible for not calling twice. */
  grantWelcomeBonus: () => void;
  /** Mark the store as in-sync with a given cloud savedAt. Called from
   *  providers.tsx after a successful save or load. */
  markSynced: (savedAt: number) => void;
  /** Replace persisted state wholesale with a cloud snapshot, then mark
   *  the corresponding savedAt. Used by app-open auto-load and by the
   *  Settings "立即拉取" button. */
  applyCloudSnapshot: (snapshot: Partial<UserState>, savedAt: number) => void;

  // Recharge time pool with F or H
  recharge: (data: { fSpent: number; hSpent: number; minutesGained: number }) => void;

  // Consumption
  spendFood: (data: { name: string; price: number; hSpent: number }) => void;

  // Entertainment session lifecycle (mirrors pomodoro)
  startPlay: (data: { type: PlayType; minutes: number; costMinutes?: number }) => void;
  endPlay: (data?: { refundMinutes?: number }) => void;

  // Pomodoro session lifecycle
  startSession: (data: { task: string; tag: TagId; type: SessionType }) => void;
  endSession: (data?: { completedCount?: number }) => void;
  addNoteToSession: (note: string) => void;
  /**
   * Advance the active session's phase based on wall-clock time.
   *
   * - `mode` flips between "running" (25min) and "buffer" (1min)
   * - On natural advance the next `phaseStartedAt = current + duration`,
   *   so multiple boundaries crossed during a sleep are caught up.
   * - On manual buffer skip the next pomodoro starts at `now`.
   */
  advancePomodoroPhase: (data?: { manual?: boolean; now?: number }) => void;

  // Kanban
  moveKanbanCard: (data: { cardId: string; toCol: KanbanColumnId }) => void;
  addKanbanCard: (data: { col: KanbanColumnId; card: KanbanCard }) => void;

  // Wishlist
  addWish: (data: Omit<import("./types").WishlistItem, "id" | "progress">) => void;
  removeWish: (wishId: string) => void;
  redeemWish: (data: { wishId: string; fSpent: number; hSpent: number }) => void;

  // Food presets (editable list)
  addFoodPreset: (preset: Omit<FoodPreset, "id">) => void;
  updateFoodPreset: (id: string, patch: Partial<Omit<FoodPreset, "id">>) => void;
  removeFoodPreset: (id: string) => void;

  // Tags (editable; id immutable, label/color editable; hard delete)
  addTag: (data: { label: string; color: TagColor }) => void;
  updateTag: (id: TagId, patch: Partial<Pick<TagConfig, "label" | "color">>) => void;
  removeTag: (id: TagId) => void;

  // Bonuses (editable list of tier rules)
  addBonus: (data: Omit<BonusConfig, "id">) => void;
  updateBonus: (id: string, patch: Partial<Omit<BonusConfig, "id">>) => void;
  removeBonus: (id: string) => void;

  // Internal helpers
  reset: () => void;
}

export type Store = UserState & StoreActions;

// ─────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      settle: ({ fGained, hGained }) =>
        set((s) => {
          const daily = normalizeDay(s);
          const createdAt = Date.now();
          const entry: TokenLedgerEntry = {
            id: `t-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "settle",
            fDelta: fGained,
            hDelta: hGained,
            createdAt,
            dayKey: todayKey(new Date(createdAt)),
            note: "daily settle",
          };
          return {
            ...daily,
            ftoken: round(s.ftoken + fGained),
            htoken: round(s.htoken + hGained),
            todayFGained: round((daily.todayFGained ?? s.todayFGained ?? 0) + fGained),
            todayHGained: round((daily.todayHGained ?? s.todayHGained ?? 0) + hGained),
            tokenHistory: [entry, ...(s.tokenHistory ?? [])].slice(0, 1000),
            lastSettledDate: todayKey(),
          };
        }),

      ensureToday: () =>
        set((s) => ({
          ...normalizeDay(s),
        })),

      markSynced: (savedAt) =>
        set((s) => (savedAt > s.lastSavedAt ? { lastSavedAt: savedAt } : s)),

      applyCloudSnapshot: (snapshot, savedAt) =>
        set(() => ({ ...DEFAULTS, ...snapshot, lastSavedAt: savedAt })),

      grantWelcomeBonus: () =>
        set((s) => {
          // v9+: idempotency is delegated to the per-browser localStorage
          // flag (`tokmato:welcome-granted`) checked by the caller. This
          // action unconditionally applies the bonus and emits a ledger
          // entry. Multiple welcomes (e.g. anon-then-cloud collision) are
          // reconciled by `dedupWelcomeEntries` at merge time.
          const daily = normalizeDay(s);
          const createdAt = Date.now();
          const entry: TokenLedgerEntry = {
            id: `t-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "welcome",
            fDelta: WELCOME_FTOKEN,
            hDelta: WELCOME_HTOKEN,
            createdAt,
            dayKey: todayKey(new Date(createdAt)),
            note: "welcome",
          };
          return {
            ...daily,
            ftoken: round(s.ftoken + WELCOME_FTOKEN),
            htoken: round(s.htoken + WELCOME_HTOKEN),
            todayFGained: round((daily.todayFGained ?? s.todayFGained ?? 0) + WELCOME_FTOKEN),
            todayHGained: round((daily.todayHGained ?? s.todayHGained ?? 0) + WELCOME_HTOKEN),
            tokenHistory: [entry, ...(s.tokenHistory ?? [])].slice(0, 1000),
          };
        }),

      recharge: ({ fSpent, hSpent, minutesGained }) =>
        set((s) => {
          // Reject when balances can't cover the cost — otherwise the time
          // pool would credit `minutesGained` even from a zero balance.
          // Mirrors the redeemWish guard.
          if (fSpent > s.ftoken || hSpent > s.htoken) return s;
          const daily = normalizeDay(s);
          const createdAt = Date.now();
          const ledgerEntry: TokenLedgerEntry = {
            id: `t-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "recharge",
            fDelta: -fSpent,
            hDelta: -hSpent,
            minutesDelta: minutesGained,
            createdAt,
            dayKey: todayKey(new Date(createdAt)),
            note: `recharge ${minutesGained}min`,
          };
          return {
            ...daily,
            ftoken: round(clamp(s.ftoken - fSpent)),
            htoken: round(clamp(s.htoken - hSpent)),
            timePool: clamp(s.timePool + minutesGained),
            todayPoolGained: (daily.todayPoolGained ?? s.todayPoolGained ?? 0) + minutesGained,
            tokenHistory: [ledgerEntry, ...(s.tokenHistory ?? [])].slice(0, 1000),
          };
        }),

      startPlay: ({ type, minutes, costMinutes }) =>
        set((s) => {
          // Deduct upfront; endPlay can refund unused minutes if user
          // ends early. clamp avoids going negative if budget changed.
          const requestedCost = costMinutes ?? minutes;
          const actualCost = Math.min(requestedCost, s.timePool);
          const startedAt = Date.now();
          const playSession: PlaySession = {
            type,
            totalMinutes: minutes,
            costMinutes: actualCost,
            startedAt,
          };
          const ledgerEntry: TokenLedgerEntry | null =
            actualCost > 0
              ? {
                  id: `t-${startedAt}-${Math.random().toString(36).slice(2, 6)}`,
                  kind: "play",
                  fDelta: 0,
                  hDelta: 0,
                  minutesDelta: -actualCost,
                  createdAt: startedAt,
                  dayKey: todayKey(new Date(startedAt)),
                  note: type,
                }
              : null;
          return {
            ...normalizeDay(s),
            playSession,
            timePool: clamp(s.timePool - actualCost),
            tokenHistory: ledgerEntry
              ? [ledgerEntry, ...(s.tokenHistory ?? [])].slice(0, 1000)
              : s.tokenHistory ?? [],
          };
        }),

      endPlay: (data) =>
        set((s) => {
          const refund = data?.refundMinutes ?? 0;
          if (refund <= 0) {
            return {
              playSession: null,
              timePool: clamp(s.timePool + refund),
            };
          }
          const createdAt = Date.now();
          const ledgerEntry: TokenLedgerEntry = {
            id: `t-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "play",
            fDelta: 0,
            hDelta: 0,
            minutesDelta: refund,
            createdAt,
            dayKey: todayKey(new Date(createdAt)),
            note: "refund",
          };
          return {
            playSession: null,
            timePool: clamp(s.timePool + refund),
            tokenHistory: [ledgerEntry, ...(s.tokenHistory ?? [])].slice(0, 1000),
          };
        }),

      spendFood: ({ name, hSpent }) =>
        set((s) => {
          const createdAt = Date.now();
          const ledgerEntry: TokenLedgerEntry = {
            id: `t-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "food",
            fDelta: 0,
            hDelta: -hSpent,
            createdAt,
            dayKey: todayKey(new Date(createdAt)),
            note: name,
          };
          return {
            ...normalizeDay(s),
            htoken: round(clamp(s.htoken - hSpent)),
            tokenHistory: [ledgerEntry, ...(s.tokenHistory ?? [])].slice(0, 1000),
          };
        }),

      startSession: ({ task, tag, type }) => {
        const now = Date.now();
        const session: PomodoroSession = {
          task,
          tag,
          type,
          startedAt: now,
          phaseStartedAt: now,
          count: 1,
          mode: "running",
          notes: [],
        };
        set((s) => ({ ...normalizeDay(s), session }));
      },

      advancePomodoroPhase: (data) =>
        set((s) => {
          if (!s.session) return s;
          const now = data?.now ?? Date.now();
          const manual = data?.manual === true;
          const POMO_MS = 25 * 60 * 1000;
          const BUFFER_MS = 60 * 1000;
          const { mode, phaseStartedAt, count } = s.session;
          const duration = mode === "running" ? POMO_MS : BUFFER_MS;
          // Manual skip is only valid during buffer (the user clicked
          // "继续下一个"). Running mode never skips manually — that path
          // is "结束这一串" and goes through endSession.
          if (manual && mode === "buffer") {
            return {
              session: {
                ...s.session,
                mode: "running",
                count: count + 1,
                phaseStartedAt: now,
              },
            };
          }
          // Natural advance: only when the boundary has actually been
          // crossed. Caller may invoke this on every tick; we no-op
          // until the wall-clock has passed `phaseStartedAt + duration`.
          if (now < phaseStartedAt + duration) return s;
          if (mode === "running") {
            return {
              session: {
                ...s.session,
                mode: "buffer",
                phaseStartedAt: phaseStartedAt + duration,
              },
            };
          }
          return {
            session: {
              ...s.session,
              mode: "running",
              count: count + 1,
              phaseStartedAt: phaseStartedAt + duration,
            },
          };
        }),

      endSession: (data) =>
        set((s) => {
          if (!s.session) return s;
          const daily = normalizeDay(s);
          const baseTodayPomos = daily.todayPomos ?? s.todayPomos;
          const baseCountsByTag =
            daily.todayCountsByTag ?? s.todayCountsByTag ?? {};
          const tagId = s.session.tag;
          const baseTagCount = baseCountsByTag[tagId] ?? 0;
          const baseTodayF = daily.todayFGained ?? s.todayFGained ?? 0;
          const isInput = s.session.type === "input";
          const completedCount = Math.max(0, data?.completedCount ?? s.session.count);
          const fGain = (isInput ? 1 : 0.5) * completedCount;
          const newTodayPomos = baseTodayPomos + completedCount;
          const newTagCount = baseTagCount + completedCount;
          // Tag BONUS: sum of crossed-tier rewards across every bonus
          // attached to this tag. Replaces v1.7's hardcoded math 5/7/9/11
          // ladder; default seed bonus replicates the same behavior up to
          // tier 3 and extrapolates past it.
          const bonusF = totalBonusF(s.bonuses, tagId, baseTagCount, newTagCount);
          const totalFGain = fGain + bonusF;
          // Update recents
          const taskName = s.session.task;
          const filtered = s.recentTasks.filter((t) => t !== taskName);
          const recentTasks = [taskName, ...filtered].slice(0, 5);
          const endedAt = Date.now();
          const record: PomodoroRecord | null = completedCount > 0
            ? {
                id: `p-${endedAt}-${Math.random().toString(36).slice(2, 6)}`,
                task: taskName,
                tag: s.session.tag,
                type: s.session.type,
                count: completedCount,
                minutes: completedCount * 25,
                fGained: fGain,
                bonusF,
                startedAt: s.session.startedAt,
                endedAt,
                dayKey: todayKey(new Date(endedAt)),
              }
            : null;
          const tokenEntry: TokenLedgerEntry | null = record
            ? {
                id: `t-${endedAt}-${Math.random().toString(36).slice(2, 6)}`,
                kind: "pomodoro",
                fDelta: totalFGain,
                hDelta: 0,
                createdAt: endedAt,
                dayKey: record.dayKey,
                note: taskName,
                pomodoroRecordId: record.id,
              }
            : null;
          return {
            ...daily,
            session: null,
            todayPomos: newTodayPomos,
            todayCountsByTag: { ...baseCountsByTag, [tagId]: newTagCount },
            todayFGained: round(baseTodayF + totalFGain),
            ftoken: round(s.ftoken + totalFGain),
            pomodoroHistory: record
              ? [record, ...(s.pomodoroHistory ?? [])].slice(0, 500)
              : s.pomodoroHistory ?? [],
            tokenHistory: tokenEntry
              ? [tokenEntry, ...(s.tokenHistory ?? [])].slice(0, 1000)
              : s.tokenHistory ?? [],
            recentTasks,
          };
        }),

      addNoteToSession: (note) =>
        set((s) =>
          s.session
            ? { session: { ...s.session, notes: [...s.session.notes, note] } }
            : s
        ),

      moveKanbanCard: ({ cardId, toCol }) =>
        set((s) => {
          let moved: KanbanCard | null = null;
          const next = { ...s.kanban };
          (Object.keys(next) as KanbanColumnId[]).forEach((cid) => {
            const found = next[cid].find((c) => c.id === cardId);
            if (found) moved = found;
            next[cid] = next[cid].filter((c) => c.id !== cardId);
          });
          if (!moved) return s;
          next[toCol] = [...next[toCol], moved];
          return { kanban: next };
        }),

      addKanbanCard: ({ col, card }) =>
        set((s) => ({
          ...normalizeDay(s),
          kanban: { ...s.kanban, [col]: [...s.kanban[col], card] },
        })),

      addFoodPreset: ({ name, price }) =>
        set((s) => ({
          ...normalizeDay(s),
          foodPresets: [
            ...s.foodPresets,
            { id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, price },
          ],
        })),

      updateFoodPreset: (id, patch) =>
        set((s) => ({
          foodPresets: s.foodPresets.map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        })),

      removeFoodPreset: (id) =>
        set((s) => ({
          foodPresets: s.foodPresets.filter((p) => p.id !== id),
        })),

      addTag: ({ label, color }) =>
        set((s) => {
          const trimmed = label.trim();
          if (!trimmed) return s;
          // id derived from a timestamp so it's stable but unique. Label can
          // change later without breaking history (which references id).
          const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          return { tags: [...s.tags, { id, label: trimmed, color }] };
        }),

      updateTag: (id, patch) =>
        set((s) => ({
          tags: s.tags.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...(patch.label !== undefined
                    ? { label: patch.label.trim() || t.label }
                    : {}),
                  ...(patch.color !== undefined ? { color: patch.color } : {}),
                }
              : t,
          ),
        })),

      removeTag: (id) =>
        set((s) => ({
          // Hard delete: history records that referenced this id keep the
          // string; UI renders unknown ids as plain text without a chip color.
          // Bonuses attached to this tag are dropped as well.
          tags: s.tags.filter((t) => t.id !== id),
          bonuses: s.bonuses.filter((b) => b.tagId !== id),
        })),

      addBonus: ({ tagId, threshold, initialReward, step, stepReward }) =>
        set((s) => {
          if (!s.tags.some((t) => t.id === tagId)) return s;
          const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          return {
            bonuses: [
              ...s.bonuses,
              { id, tagId, threshold, initialReward, step, stepReward },
            ],
          };
        }),

      updateBonus: (id, patch) =>
        set((s) => ({
          bonuses: s.bonuses.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),

      removeBonus: (id) =>
        set((s) => ({
          bonuses: s.bonuses.filter((b) => b.id !== id),
        })),

      addWish: ({ name, price, pay, why }) =>
        set((s) => ({
          ...normalizeDay(s),
          wishlist: [
            ...s.wishlist,
            {
              id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name,
              price,
              pay,
              why,
              progress: 0, // legacy field; UI derives from balance
            },
          ],
        })),

      removeWish: (wishId) =>
        set((s) => ({
          wishlist: s.wishlist.filter((w) => w.id !== wishId),
        })),

      redeemWish: ({ wishId, fSpent, hSpent }) =>
        set((s) => {
          const daily = normalizeDay(s);
          const wish = s.wishlist.find((w) => w.id === wishId);
          if (!wish) return s;
          if (fSpent > s.ftoken || hSpent > s.htoken) return s; // guard
          const createdAt = Date.now();
          const ledgerEntry: TokenLedgerEntry = {
            id: `t-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "wish",
            fDelta: -fSpent,
            hDelta: -hSpent,
            createdAt,
            dayKey: todayKey(new Date(createdAt)),
            note: wish.name,
            refId: wishId,
          };
          return {
            ...daily,
            ftoken: round(clamp(s.ftoken - fSpent)),
            htoken: round(clamp(s.htoken - hSpent)),
            wishlist: s.wishlist.filter((w) => w.id !== wishId),
            achievements: [
              { id: wish.id, name: wish.name, price: wish.price, date: todayKey(), why: wish.why },
              ...s.achievements,
            ],
            tokenHistory: [ledgerEntry, ...(s.tokenHistory ?? [])].slice(0, 1000),
          };
        }),

      reset: () => set(createStarterState()),
    }) as Store & {
      addRecentTask?: (t: string) => void; // private helper escape hatch
    },
    {
      name: "tokmato:state",
      version: 8,
      // v1 → v2: replace single-slot welcomeGrantUserId with an array so
      // alternating accounts on the same device can't farm welcome bonuses.
      // v2 → v3: add session.phaseStartedAt for clock-based timer.
      // v3 → v4: add lastSavedAt for auto-sync LWW arbitration. Default 0
      //          means "never synced", forcing the first app-open load to
      //          accept whatever cloud has.
      // v4 → v5: add guideSeenUserIds. (Removed in v6.)
      // v5 → v6: drop guideSeenUserIds in favor of a per-browser
      //          localStorage flag (`tokmato:guide-seen`). Pre-existing
      //          devices with welcomeGrantedUserIds (or the v5 array)
      //          are flagged "seen" so the guide doesn't pop on users
      //          who've already been using the app.
      // v6 → v7: configurable tags + bonuses. Drop todayMathPomos in
      //          favor of todayCountsByTag (per-tag counter). Seed tags
      //          and bonuses with the v1.7 defaults so existing users
      //          see the same tag list and the same math 5/7/9/11
      //          ladder behavior (now extrapolated past 11).
      // v7 → v8: BREAKING wipe. Welcome moves to per-browser localStorage
      //          flag; ledger writes added for all spending; default
      //          merge replaces LWW. Per-user welcome dedup
      //          (`welcomeGrantedUserIds`) retired. Local state wholly
      //          reset to defaults; cloud snapshot will be merged back
      //          after auth. localStorage flags (guide-seen / welcome-
      //          granted) cleared so the user retraces the first-run
      //          path. A `tokmato:v8-just-upgraded` marker is dropped so
      //          providers.tsx can run a one-shot server-side cleanup
      //          (cancelPushChain + clearActiveSession) — without it a
      //          mid-session upgrade would orphan the QStash chain and
      //          the cross-device active marker.
      migrate: (persistedState, version) => {
        if (version < 8 && typeof window !== "undefined") {
          try {
            window.localStorage.removeItem("tokmato:guide-seen");
            window.localStorage.removeItem("tokmato:welcome-granted");
            window.localStorage.setItem("tokmato:v8-just-upgraded", "1");
          } catch {}
          return createStarterState() as Partial<UserState>;
        }
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState as Partial<UserState>;
        }
        const state = persistedState as Record<string, unknown>;
        if (version < 2) {
          const legacy = state.welcomeGrantUserId;
          state.welcomeGrantedUserIds =
            typeof legacy === "string" && legacy ? [legacy] : [];
          delete state.welcomeGrantUserId;
        }
        if (version < 3) {
          const sess = state.session as Record<string, unknown> | null | undefined;
          if (sess && typeof sess.startedAt === "number" && typeof sess.phaseStartedAt !== "number") {
            // Best-effort: restart the current phase from now to avoid
            // an instant jump that would skip multiple boundaries.
            sess.phaseStartedAt = Date.now();
          }
        }
        if (version < 4) {
          if (typeof state.lastSavedAt !== "number") state.lastSavedAt = 0;
        }
        if (version < 6) {
          const granted = state.welcomeGrantedUserIds;
          const oldSeen = state.guideSeenUserIds;
          const isExistingUser =
            (Array.isArray(granted) && granted.length > 0) ||
            (Array.isArray(oldSeen) && oldSeen.length > 0);
          if (isExistingUser && typeof window !== "undefined") {
            try {
              window.localStorage.setItem("tokmato:guide-seen", "1");
            } catch {}
          }
          delete state.guideSeenUserIds;
        }
        if (version < 7) {
          // Move todayMathPomos counter into the new generic shape, then
          // drop the legacy field.
          const legacyMath = state.todayMathPomos;
          const counts =
            (state.todayCountsByTag as Record<string, number> | undefined) ?? {};
          if (typeof legacyMath === "number" && legacyMath > 0) {
            counts.math = legacyMath;
          }
          state.todayCountsByTag = counts;
          delete state.todayMathPomos;
          // Seed tags / bonuses if absent. Existing users get the v1.7
          // hardcoded defaults so the UI doesn't appear empty after the
          // bump; new users get the same via createStarterState.
          if (!Array.isArray(state.tags) || state.tags.length === 0) {
            state.tags = DEFAULT_TAGS.map((t) => ({ ...t }));
          }
          if (!Array.isArray(state.bonuses) || state.bonuses.length === 0) {
            state.bonuses = DEFAULT_BONUSES.map((b) => ({ ...b }));
          }
        }
        return state as Partial<UserState>;
      },
      // Skip auto-hydrate so SSR and the very first client render both
      // see DEFAULTS — eliminating hydration mismatch. We rehydrate
      // manually inside Providers (useEffect) which is purely a client
      // state transition and does NOT trigger a mismatch warning.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      // Only persist user data — actions are reconstructed from code
      partialize: (s) => selectSnapshot(s),
    }
  )
);

/**
 * Project the in-memory store down to the persisted/cloud-shipped slice.
 * Single source of truth for `partialize` (localStorage) AND the
 * `saveToCloud` payload (KV). When you add a new persistent field, edit
 * here AND `persistedSnapshotSchema` — the schema is strict.
 */
export function selectSnapshot(s: UserState): Partial<UserState> {
  return {
    ftoken: s.ftoken,
    htoken: s.htoken,
    timePool: s.timePool,
    lastSettledDate: s.lastSettledDate,
    activeDay: s.activeDay,
    session: s.session,
    playSession: s.playSession,
    todayPomos: s.todayPomos,
    todayCountsByTag: s.todayCountsByTag,
    todayFGained: s.todayFGained,
    todayHGained: s.todayHGained,
    todayPoolGained: s.todayPoolGained,
    tags: s.tags,
    bonuses: s.bonuses,
    lastSavedAt: s.lastSavedAt,
    pomodoroHistory: s.pomodoroHistory,
    tokenHistory: s.tokenHistory,
    wishlist: s.wishlist,
    achievements: s.achievements,
    kanban: s.kanban,
    recentTasks: s.recentTasks,
    foodPresets: s.foodPresets,
  };
}

