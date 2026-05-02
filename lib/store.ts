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
  SessionType,
  PomodoroRecord,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Defaults — first-run starter state; once user has data in storage, this is unused.
// ─────────────────────────────────────────────────────────────────────────
const STARTER_FTOKEN = 10;
const STARTER_HTOKEN = 5;

function createStarterState(): UserState {
  return {
    ftoken: STARTER_FTOKEN,
    htoken: STARTER_HTOKEN,
    timePool: 0,
    lastSettledDate: null,
    activeDay: todayKey(),
    session: null,
    playSession: null,
    todayMathPomos: 0,
    todayPomos: 0,
    todayFGained: 0,
    todayHGained: 0,
    todayPoolGained: 0,
    pomodoroHistory: [],
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

const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
const clamp = (v: number, lo = 0, hi = Infinity) => Math.max(lo, Math.min(hi, v));

function normalizeDay(s: Store): Partial<UserState> {
  const nextDay = todayKey();
  const activeDay = s.activeDay;
  if (!activeDay) {
    return {
      activeDay: nextDay,
      todayPomos: 0,
      todayMathPomos: 0,
      todayFGained: 0,
      todayHGained: 0,
      todayPoolGained: 0,
    };
  }
  if (activeDay === nextDay) return {};
  return {
    activeDay: nextDay,
    todayPomos: 0,
    todayMathPomos: 0,
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
          return {
            ...daily,
            ftoken: round(s.ftoken + fGained),
            htoken: round(s.htoken + hGained),
            todayFGained: round((daily.todayFGained ?? s.todayFGained ?? 0) + fGained),
            todayHGained: round((daily.todayHGained ?? s.todayHGained ?? 0) + hGained),
            lastSettledDate: todayKey(),
          };
        }),

      ensureToday: () =>
        set((s) => ({
          ...normalizeDay(s),
        })),

      recharge: ({ fSpent, hSpent, minutesGained }) =>
        set((s) => {
          const daily = normalizeDay(s);
          return {
            ...daily,
            ftoken: round(clamp(s.ftoken - fSpent)),
            htoken: round(clamp(s.htoken - hSpent)),
            timePool: clamp(s.timePool + minutesGained),
            todayPoolGained: (daily.todayPoolGained ?? s.todayPoolGained ?? 0) + minutesGained,
          };
        }),

      startPlay: ({ type, minutes, costMinutes }) =>
        set((s) => {
          // Deduct upfront; endPlay can refund unused minutes if user
          // ends early. clamp avoids going negative if budget changed.
          const requestedCost = costMinutes ?? minutes;
          const actualCost = Math.min(requestedCost, s.timePool);
          const playSession: PlaySession = {
            type,
            totalMinutes: minutes,
            costMinutes: actualCost,
            startedAt: Date.now(),
          };
          return {
            ...normalizeDay(s),
            playSession,
            timePool: clamp(s.timePool - actualCost),
          };
        }),

      endPlay: (data) =>
        set((s) => ({
          playSession: null,
          timePool: clamp(s.timePool + (data?.refundMinutes ?? 0)),
        })),

      spendFood: ({ hSpent }) =>
        set((s) => ({
          ...normalizeDay(s),
          htoken: round(clamp(s.htoken - hSpent)),
        })),

      startSession: ({ task, tag, type }) => {
        const session: PomodoroSession = {
          task,
          tag,
          type,
          startedAt: Date.now(),
          count: 1,
          mode: "running",
          notes: [],
        };
        set((s) => ({ ...normalizeDay(s), session }));
      },

      endSession: (data) =>
        set((s) => {
          if (!s.session) return s;
          const daily = normalizeDay(s);
          const baseTodayPomos = daily.todayPomos ?? s.todayPomos;
          const baseTodayMath = daily.todayMathPomos ?? s.todayMathPomos;
          const baseTodayF = daily.todayFGained ?? s.todayFGained ?? 0;
          const isInput = s.session.type === "input";
          const isMath = s.session.tag === "math";
          const completedCount = Math.max(0, data?.completedCount ?? s.session.count);
          const fGain = (isInput ? 1 : 0.5) * completedCount;
          const newTodayPomos = baseTodayPomos + completedCount;
          const newTodayMath = isMath ? baseTodayMath + completedCount : baseTodayMath;
          // Math BONUS: hitting 5/7/9/11 #math pomos in a day awards
          // an extra +1F (per ladder visualized on Home).
          const MATH_MILESTONES = [5, 7, 9, 11];
          const bonusF = isMath
            ? MATH_MILESTONES.filter(
                (m) => baseTodayMath < m && m <= newTodayMath
              ).length
            : 0;
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
          return {
            ...daily,
            session: null,
            todayPomos: newTodayPomos,
            todayMathPomos: newTodayMath,
            todayFGained: round(baseTodayF + totalFGain),
            ftoken: round(s.ftoken + totalFGain),
            pomodoroHistory: record
              ? [record, ...(s.pomodoroHistory ?? [])].slice(0, 500)
              : s.pomodoroHistory ?? [],
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
          return {
            ...daily,
            ftoken: round(clamp(s.ftoken - fSpent)),
            htoken: round(clamp(s.htoken - hSpent)),
            wishlist: s.wishlist.filter((w) => w.id !== wishId),
            achievements: [
              { id: wish.id, name: wish.name, price: wish.price, date: todayKey(), why: wish.why },
              ...s.achievements,
            ],
          };
        }),

      reset: () => set(createStarterState()),
    }) as Store & {
      addRecentTask?: (t: string) => void; // private helper escape hatch
    },
    {
      name: "tokmato:state",
      version: 1,
      // Skip auto-hydrate so SSR and the very first client render both
      // see DEFAULTS — eliminating hydration mismatch. We rehydrate
      // manually inside Providers (useEffect) which is purely a client
      // state transition and does NOT trigger a mismatch warning.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      // Only persist user data — actions are reconstructed from code
      partialize: (s) => ({
        ftoken: s.ftoken,
        htoken: s.htoken,
        timePool: s.timePool,
        lastSettledDate: s.lastSettledDate,
        activeDay: s.activeDay,
        session: s.session,
        playSession: s.playSession,
        todayMathPomos: s.todayMathPomos,
        todayPomos: s.todayPomos,
        todayFGained: s.todayFGained,
        todayHGained: s.todayHGained,
        todayPoolGained: s.todayPoolGained,
        pomodoroHistory: s.pomodoroHistory,
        wishlist: s.wishlist,
        achievements: s.achievements,
        kanban: s.kanban,
        recentTasks: s.recentTasks,
        foodPresets: s.foodPresets,
      }),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────
// Hydration guard — prevents SSR/client mismatch flash
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/** Convenience: returns true when the persisted state has been read back
 *  from localStorage (or there was nothing to read). Use this to gate
 *  rendering of values that would otherwise flash during hydration. */
export function useStoreHydrated(): boolean {
  const [ready, setReady] = useState(useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setReady(true));
    return unsub;
  }, []);
  return ready;
}
