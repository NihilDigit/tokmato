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
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Defaults — first-run mock; once user has data in storage, this is unused.
// ─────────────────────────────────────────────────────────────────────────
const DEFAULTS: UserState = {
  ftoken: 12.5,
  htoken: 4.5,
  timePool: 47,
  lastSettledDate: null,
  session: null,
  playSession: null,
  todayMathPomos: 4,
  todayPomos: 7,
  wishlist: [
    { id: "w1", name: "Kindle Paperwhite 第 12 代", price: 880, pay: "mixed", why: "把短视频时间换成读书。每月省一半 H 也能凑齐。", progress: 0.62 },
    { id: "w2", name: "降噪耳塞 (Loop Quiet)", price: 180, pay: "F", why: "宿舍图书馆通用,降低专注启动摩擦。", progress: 0.41 },
    { id: "w3", name: "《图兰朵》歌剧票", price: 280, pay: "F", why: "上次听完《波西米亚人》,半个月都在回味。", progress: 0.18 },
    { id: "w4", name: "桌面金属支架", price: 95, pay: "mixed", why: "颈椎已经在抗议了。", progress: 0.78 },
    { id: "w5", name: "LAMY Safari 钢笔", price: 220, pay: "F", why: "做题手感差,纸笔交互应该被升级。", progress: 0.05 },
  ],
  achievements: [
    { id: "a1", name: "人体工学椅腰垫", price: 65, date: "2025-04-22", why: "第一次坐 4h 不腰酸。" },
    { id: "a2", name: "《卡拉马佐夫兄弟》精装", price: 138, date: "2025-04-09", why: "攒了 11 天 F。读完夜宵预算又能多撑一周。" },
    { id: "a3", name: "降噪耳机线 (升级)", price: 49, date: "2025-03-30", why: "小升级,大体感。" },
    { id: "a4", name: "《图兰朵》歌剧票", price: 280, date: "2025-03-12", why: "第一次现场歌剧,难忘。" },
  ],
  kanban: {
    inbox: [
      { id: "k1", name: "想看那本 Operating Systems: Three Easy Pieces", next: "下载 PDF 试读 1 章" },
      { id: "k2", name: "研究 jaxopt 库", next: "看 README + 跑 1 个例子" },
    ],
    Q1: [
      { id: "k3", name: "考研数学线代第三章", next: "今晚 3 个番茄, 做完真题部分" },
      { id: "k4", name: "英语阅读真题套", next: "完成 2017 阅读 4 篇" },
    ],
    Q2: [
      { id: "k5", name: "Transformer from scratch 复现", next: "实现 multi-head attention forward pass" },
      { id: "k6", name: "健身房抗阻训练", next: "今天 push day" },
      { id: "k7", name: "读 Attention Is All You Need", next: "精读第 3 节" },
    ],
    Q3: [
      { id: "k8", name: "报销学校发票", next: "收齐发票, 周三去财务" },
      { id: "k9", name: "洗床单", next: "丢洗衣机" },
    ],
    Q4: [
      { id: "k10", name: "《卡拉马佐夫兄弟》", next: "续读到第二部第三章" },
      { id: "k11", name: "听<<图兰朵>>录音版", next: "第一幕" },
    ],
  },
  recentTasks: [
    "线代第 3 章",
    "精读 Transformer paper",
    "debug dataloader",
    "英语阅读 2018 真题",
    "vibe coding tomato app",
  ],
  foodPresets: [
    { id: "fp1", name: "可乐", price: 3.5 },
    { id: "fp2", name: "雪糕", price: 5 },
  ],
};

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

// ─────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────

interface StoreActions {
  // Settlement
  settle: (data: { fGained: number; hGained: number }) => void;

  // Recharge time pool with F or H
  recharge: (data: { fSpent: number; hSpent: number; minutesGained: number }) => void;

  // Consumption
  spendFood: (data: { name: string; price: number; hSpent: number }) => void;

  // Entertainment session lifecycle (mirrors pomodoro)
  startPlay: (data: { type: PlayType; minutes: number }) => void;
  endPlay: (data?: { refundMinutes?: number }) => void;

  // Pomodoro session lifecycle
  startSession: (data: { task: string; tag: TagId; type: SessionType }) => void;
  endSession: () => void;
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
        set((s) => ({
          ftoken: round(s.ftoken + fGained),
          htoken: round(s.htoken + hGained),
          lastSettledDate: todayKey(),
        })),

      recharge: ({ fSpent, hSpent, minutesGained }) =>
        set((s) => ({
          ftoken: round(clamp(s.ftoken - fSpent)),
          htoken: round(clamp(s.htoken - hSpent)),
          timePool: clamp(s.timePool + minutesGained),
        })),

      startPlay: ({ type, minutes }) =>
        set((s) => {
          // Deduct upfront; endPlay can refund unused minutes if user
          // ends early. clamp avoids going negative if budget changed.
          const actual = Math.min(minutes, s.timePool);
          const playSession: PlaySession = {
            type,
            totalMinutes: actual,
            startedAt: Date.now(),
          };
          return {
            playSession,
            timePool: clamp(s.timePool - actual),
          };
        }),

      endPlay: (data) =>
        set((s) => ({
          playSession: null,
          timePool: clamp(s.timePool + (data?.refundMinutes ?? 0)),
        })),

      spendFood: ({ hSpent }) =>
        set((s) => ({
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
        set({ session });
      },

      endSession: () =>
        set((s) => {
          if (!s.session) return s;
          const isInput = s.session.type === "input";
          const isMath = s.session.tag === "math";
          const fGain = isInput ? 1 : 0.5;
          const newTodayPomos = s.todayPomos + 1;
          const newTodayMath = isMath ? s.todayMathPomos + 1 : s.todayMathPomos;
          // Math BONUS: hitting 5/7/9/11 #math pomos in a day awards
          // an extra +1F (per ladder visualized on Home).
          const MATH_MILESTONES = [5, 7, 9, 11];
          const bonusF =
            isMath && MATH_MILESTONES.includes(newTodayMath) ? 1 : 0;
          // Update recents
          const taskName = s.session.task;
          const filtered = s.recentTasks.filter((t) => t !== taskName);
          const recentTasks = [taskName, ...filtered].slice(0, 5);
          return {
            session: null,
            todayPomos: newTodayPomos,
            todayMathPomos: newTodayMath,
            ftoken: round(s.ftoken + fGain + bonusF),
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
          kanban: { ...s.kanban, [col]: [...s.kanban[col], card] },
        })),

      addFoodPreset: ({ name, price }) =>
        set((s) => ({
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
          const wish = s.wishlist.find((w) => w.id === wishId);
          if (!wish) return s;
          if (fSpent > s.ftoken || hSpent > s.htoken) return s; // guard
          return {
            ftoken: round(clamp(s.ftoken - fSpent)),
            htoken: round(clamp(s.htoken - hSpent)),
            wishlist: s.wishlist.filter((w) => w.id !== wishId),
            achievements: [
              { id: wish.id, name: wish.name, price: wish.price, date: todayKey(), why: wish.why },
              ...s.achievements,
            ],
          };
        }),

      reset: () => set(DEFAULTS),
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
        session: s.session,
        playSession: s.playSession,
        todayMathPomos: s.todayMathPomos,
        todayPomos: s.todayPomos,
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
