/**
 * Unit tests for `lib/store.ts` — runs under `bun test`.
 *
 * NB: bun's runtime is Node-compatible and does not provide localStorage by
 * default. The persist middleware in store.ts captures `localStorage` at
 * module-eval time inside `createJSONStorage(() => localStorage)`, so we
 * must inject a stub onto `globalThis` BEFORE importing the store.
 */

// ---------------------------------------------------------------------------
// localStorage stub — must run before the store import.
// ---------------------------------------------------------------------------
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
  get length() {
    return this.store.size;
  }
}
// @ts-expect-error - injecting browser API into Node-style global
globalThis.localStorage = new MemoryStorage();

// ---------------------------------------------------------------------------
// Imports (after stub).
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from "bun:test";
import { useStore, todayKey, yesterdayKey } from "./store";
import type { KanbanCard, WishlistItem } from "./types";

// The store uses `persist({ skipHydration: true })`. Without rehydration
// every `set()` logs a noisy "storage currently unavailable" warning to
// stderr. Under `bun:test` the `useStore.persist` accessor is sometimes
// not exposed (instrumentation quirk), so we just filter the warning at
// the console layer — the persisted writes are irrelevant for tests
// because `reset()` runs in `beforeEach` anyway.
const _origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = args[0];
  if (
    typeof first === "string" &&
    first.includes("[zustand persist middleware]")
  ) {
    return;
  }
  _origWarn.apply(console, args as Parameters<typeof console.warn>);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const s = () => useStore.getState();

/** Build a UTC-anchored Date for a given Beijing (UTC+8) wall clock. */
function beijing(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  // Beijing time = UTC + 8h, so UTC components = Beijing - 8h.
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
}

beforeEach(() => {
  // Wipe persisted state, then reset in-memory store to starter defaults.
  // @ts-expect-error - our stub
  globalThis.localStorage.clear();
  useStore.getState().reset();
});

// ===========================================================================
// todayKey
// ===========================================================================
describe("todayKey", () => {
  it("returns YYYY-MM-DD for a normal Beijing afternoon", () => {
    expect(todayKey(beijing(2026, 5, 3, 14, 0))).toBe("2026-05-03");
  });

  it("treats Beijing 03:30 as the previous day (4am cutoff)", () => {
    expect(todayKey(beijing(2026, 5, 3, 3, 30))).toBe("2026-05-02");
  });

  it("flips to the new day exactly at Beijing 04:00", () => {
    expect(todayKey(beijing(2026, 5, 3, 4, 0))).toBe("2026-05-03");
  });

  it("rolls month boundary correctly when before 4am", () => {
    expect(todayKey(beijing(2026, 5, 1, 2, 0))).toBe("2026-04-30");
  });
});

// ===========================================================================
// yesterdayKey
// ===========================================================================
describe("yesterdayKey", () => {
  it("returns the prior tokmato day for a normal Beijing morning", () => {
    expect(yesterdayKey(beijing(2026, 5, 3, 9, 0))).toBe("2026-05-02");
  });

  it("treats a Beijing late-night before 4am as still 'yesterday' = 2 days back", () => {
    // 03:30 today is still tokmato-yesterday by todayKey; yesterdayKey
    // is the tokmato-day 24h before that.
    expect(yesterdayKey(beijing(2026, 5, 3, 3, 30))).toBe("2026-05-01");
  });

  it("rolls month boundary", () => {
    expect(yesterdayKey(beijing(2026, 5, 1, 9, 0))).toBe("2026-04-30");
  });
});

// ===========================================================================
// grantWelcomeBonus (v9+: no-arg, per-browser flag in providers.tsx)
// ===========================================================================
describe("grantWelcomeBonus", () => {
  it("grants +5F / +10H and writes a welcome ledger entry", () => {
    s().grantWelcomeBonus();
    const st = s();
    expect(st.ftoken).toBe(5);
    expect(st.htoken).toBe(10);
    expect(st.tokenHistory.length).toBe(1);
    expect(st.tokenHistory[0].kind).toBe("welcome");
    expect(st.tokenHistory[0].fDelta).toBe(5);
    expect(st.tokenHistory[0].hDelta).toBe(10);
    expect(st.tokenHistory[0].note).toBe("welcome");
  });

  it("is NOT internally idempotent — caller (providers.tsx) gates on localStorage flag", () => {
    s().grantWelcomeBonus();
    s().grantWelcomeBonus();
    // Two welcomes recorded; merge-time `dedupWelcomeEntries` collapses
    // them. Single-process test confirms the action no longer self-gates.
    expect(s().ftoken).toBe(10);
    expect(s().htoken).toBe(20);
    expect(s().tokenHistory.filter((e) => e.kind === "welcome").length).toBe(2);
  });
});

// ===========================================================================
// ensureToday
// ===========================================================================
describe("ensureToday", () => {
  it("resets daily counters when the stored active day is stale", () => {
    useStore.setState({
      activeDay: "2026-01-01",
      todayPomos: 4,
      todayCountsByTag: { math: 2, cs: 1 },
      todayFGained: 3,
      todayHGained: 1,
      todayPoolGained: 30,
      ftoken: 8,
      htoken: 5,
      timePool: 45,
    });

    s().ensureToday();
    expect(s().activeDay).toBe(todayKey());
    expect(s().todayPomos).toBe(0);
    expect(s().todayCountsByTag).toEqual({});
    expect(s().todayFGained).toBe(0);
    expect(s().todayHGained).toBe(0);
    expect(s().todayPoolGained).toBe(0);
    expect(s().ftoken).toBe(8);
    expect(s().htoken).toBe(5);
    expect(s().timePool).toBe(45);
  });
});

// ===========================================================================
// endSession
// ===========================================================================
describe("endSession", () => {
  it("does nothing when there's no active session", () => {
    const before = s();
    s().endSession({ completedCount: 1 });
    const after = s();
    expect(after.ftoken).toBe(before.ftoken);
    expect(after.tokenHistory.length).toBe(0);
    expect(after.pomodoroHistory.length).toBe(0);
  });

  it("starts a session with running mode, count 1, and empty notes", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    expect(s().session).toMatchObject({
      task: "刷题",
      tag: "cs",
      type: "input",
      count: 1,
      mode: "running",
      notes: [],
    });
  });

  it("adds notes only while a session is active", () => {
    s().addNoteToSession("ignored");
    expect(s().session).toBeNull();

    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().addNoteToSession("卡在第 3 题");
    s().addNoteToSession("复盘错因");
    expect(s().session?.notes).toEqual(["卡在第 3 题", "复盘错因"]);
  });

  it("clears the active session without ledger/history when completedCount is 0", () => {
    s().startSession({ task: "中断任务", tag: "cs", type: "input" });
    s().endSession({ completedCount: 0 });
    expect(s().session).toBeNull();
    expect(s().ftoken).toBe(0);
    expect(s().todayPomos).toBe(0);
    expect(s().pomodoroHistory).toEqual([]);
    expect(s().tokenHistory).toEqual([]);
    expect(s().recentTasks).toEqual(["中断任务"]);
  });

  it("treats negative completedCount as 0", () => {
    s().startSession({ task: "中断任务", tag: "cs", type: "input" });
    s().endSession({ completedCount: -1 });
    expect(s().session).toBeNull();
    expect(s().ftoken).toBe(0);
    expect(s().todayPomos).toBe(0);
    expect(s().pomodoroHistory).toEqual([]);
    expect(s().tokenHistory).toEqual([]);
    expect(s().recentTasks).toEqual(["中断任务"]);
  });

  it("input session × 2 pomos awards +2 F (1 per pomo)", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().endSession({ completedCount: 2 });
    expect(s().ftoken).toBe(2);
    expect(s().pomodoroHistory[0].fGained).toBe(2);
    expect(s().pomodoroHistory[0].bonusF).toBe(0);
    expect(s().tokenHistory[0].fDelta).toBe(2);
    expect(s().tokenHistory[0].kind).toBe("pomodoro");
  });

  it("output (non-input) session × 2 pomos awards +1 F (0.5 per pomo)", () => {
    s().startSession({ task: "写笔记", tag: "cs", type: "output" });
    s().endSession({ completedCount: 2 });
    expect(s().ftoken).toBe(1);
  });

  it("math tag crossing 5 milestone (4→6) awards +1 bonus", () => {
    // Pre-seed: bring todayCountsByTag.math to 4 by ending an input math session.
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 4 });
    // ftoken so far: 4 (input math, no milestone crossed: 4 < 5 → bonus 0)
    expect((s().todayCountsByTag.math ?? 0)).toBe(4);
    expect(s().ftoken).toBe(4);

    // Now do another 2 pomos → math goes 4 → 6, crossing milestone 5.
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 2 });
    expect((s().todayCountsByTag.math ?? 0)).toBe(6);
    // +2 base (input) + 1 bonus = +3
    expect(s().ftoken).toBe(4 + 3);
    const lastRecord = s().pomodoroHistory[0];
    expect(lastRecord.bonusF).toBe(1);
    expect(lastRecord.fGained).toBe(2);
  });

  it("math tag crossing 5 AND 7 milestones (4→7) awards +2 bonus", () => {
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 4 });
    expect((s().todayCountsByTag.math ?? 0)).toBe(4);

    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 3 });
    expect((s().todayCountsByTag.math ?? 0)).toBe(7);
    // base 4 + base 3 = 7, plus 2 bonus
    expect(s().ftoken).toBe(7 + 2);
    expect(s().pomodoroHistory[0].bonusF).toBe(2);
  });

  it("math 5→6 yields no bonus (milestone is `<= newTodayMath` after a strict `<` lower bound, so 5 is already passed)", () => {
    // Bring to 5
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 5 });
    // 0 < 5 <= 5, so the +1 bonus for the 5-milestone WAS earned in this call.
    expect(s().pomodoroHistory[0].bonusF).toBe(1);

    // Now go 5 → 6. baseTodayMath=5, newTodayMath=6.
    // For each milestone m: 5 < m && m <= 6 → only m === 6, which isn't a milestone.
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 1 });
    expect((s().todayCountsByTag.math ?? 0)).toBe(6);
    expect(s().pomodoroHistory[0].bonusF).toBe(0);
  });

  it("non-math tag earns no milestone bonus even at high pomo counts", () => {
    s().startSession({ task: "刷英语", tag: "english", type: "input" });
    s().endSession({ completedCount: 6 });
    expect((s().todayCountsByTag.math ?? 0)).toBe(0);
    expect(s().pomodoroHistory[0].bonusF).toBe(0);
    expect(s().ftoken).toBe(6);
  });

  it("ledger entry references the pomodoro record id", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().endSession({ completedCount: 1 });
    const rec = s().pomodoroHistory[0];
    const ledger = s().tokenHistory[0];
    expect(ledger.pomodoroRecordId).toBe(rec.id);
    expect(rec.id.startsWith("p-")).toBe(true);
    expect(ledger.id.startsWith("t-")).toBe(true);
  });

  it("recentTasks dedups and caps at 5", () => {
    const tasks = ["a", "b", "c", "d", "e", "f"];
    for (const t of tasks) {
      s().startSession({ task: t, tag: "cs", type: "input" });
      s().endSession({ completedCount: 1 });
    }
    // Should keep 5 most recent: f, e, d, c, b
    expect(s().recentTasks).toEqual(["f", "e", "d", "c", "b"]);

    // Now repeat "d" — should move to front, no duplicate.
    s().startSession({ task: "d", tag: "cs", type: "input" });
    s().endSession({ completedCount: 1 });
    expect(s().recentTasks).toEqual(["d", "f", "e", "c", "b"]);
  });
});

// ===========================================================================
// advancePomodoroPhase
// ===========================================================================
describe("advancePomodoroPhase", () => {
  const POMO_MS = 25 * 60 * 1000;
  const BUFFER_MS = 60 * 1000;

  it("is a no-op without an active session", () => {
    s().advancePomodoroPhase({ now: 9_999_999_999 });
    expect(s().session).toBeNull();
  });

  it("running → buffer when boundary has been reached", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    const start = s().session!.phaseStartedAt;
    // Just before the boundary — no advance yet.
    s().advancePomodoroPhase({ now: start + POMO_MS - 1 });
    expect(s().session!.mode).toBe("running");

    s().advancePomodoroPhase({ now: start + POMO_MS });
    expect(s().session!.mode).toBe("buffer");
    expect(s().session!.phaseStartedAt).toBe(start + POMO_MS);
    expect(s().session!.count).toBe(1);
  });

  it("buffer → running auto-advance bumps count and shifts phaseStartedAt by BUFFER_MS", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    const start = s().session!.phaseStartedAt;
    s().advancePomodoroPhase({ now: start + POMO_MS }); // → buffer
    s().advancePomodoroPhase({ now: start + POMO_MS + BUFFER_MS });
    expect(s().session!.mode).toBe("running");
    expect(s().session!.count).toBe(2);
    expect(s().session!.phaseStartedAt).toBe(start + POMO_MS + BUFFER_MS);
  });

  it("manual buffer skip resets phaseStartedAt to `now` instead of natural boundary", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    const start = s().session!.phaseStartedAt;
    s().advancePomodoroPhase({ now: start + POMO_MS }); // → buffer
    // User clicks "继续下一个" 30s into buffer — pomodoro should restart from now.
    const skipAt = start + POMO_MS + 30_000;
    s().advancePomodoroPhase({ manual: true, now: skipAt });
    expect(s().session!.mode).toBe("running");
    expect(s().session!.count).toBe(2);
    expect(s().session!.phaseStartedAt).toBe(skipAt);
  });

  it("manual flag is ignored during running mode", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    const start = s().session!.phaseStartedAt;
    s().advancePomodoroPhase({ manual: true, now: start + 1_000 });
    expect(s().session!.mode).toBe("running");
    expect(s().session!.count).toBe(1);
  });
});

// ===========================================================================
// settle / spendFood
// ===========================================================================
describe("settle and spending", () => {
  it("settle adds F/H, tracks today's gains, and prepends a ledger entry", () => {
    s().settle({ fGained: 1.25, hGained: 2.25 });
    expect(s().ftoken).toBe(1.3);
    expect(s().htoken).toBe(2.3);
    expect(s().todayFGained).toBe(1.3);
    expect(s().todayHGained).toBe(2.3);
    expect(s().lastSettledDate).toBe(todayKey());
    expect(s().tokenHistory[0]).toMatchObject({
      kind: "settle",
      fDelta: 1.25,
      hDelta: 2.25,
      note: "daily settle",
    });
  });

  it("spendFood deducts H and clamps at zero", () => {
    s().settle({ fGained: 0, hGained: 3 });
    s().spendFood({ name: "咖啡", price: 12, hSpent: 1.5 });
    expect(s().htoken).toBe(1.5);

    s().spendFood({ name: "夜宵", price: 20, hSpent: 5 });
    expect(s().htoken).toBe(0);
  });

  it("spendFood writes a `food` ledger entry with item name as note", () => {
    s().settle({ fGained: 0, hGained: 5 });
    const before = s().tokenHistory.length;
    s().spendFood({ name: "咖啡", price: 12, hSpent: 1.5 });
    expect(s().tokenHistory.length).toBe(before + 1);
    expect(s().tokenHistory[0]).toMatchObject({
      kind: "food",
      fDelta: 0,
      hDelta: -1.5,
      note: "咖啡",
    });
  });
});

// ===========================================================================
// recharge
// ===========================================================================
describe("recharge", () => {
  it("subtracts F/H and adds time-pool minutes on a normal recharge", () => {
    // Seed balances by ending an input session.
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().endSession({ completedCount: 4 }); // +4 F
    // Manually grant H by settling
    s().settle({ fGained: 0, hGained: 5 });
    expect(s().ftoken).toBe(4);
    expect(s().htoken).toBe(5);

    s().recharge({ fSpent: 2, hSpent: 1, minutesGained: 30 });
    expect(s().ftoken).toBe(2);
    expect(s().htoken).toBe(4);
    expect(s().timePool).toBe(30);
    expect(s().todayPoolGained).toBe(30);
  });

  it("is a no-op when balances are insufficient — no minutes credited, no balance change", () => {
    // Starting balances are 0/0. Spend more than we have.
    s().recharge({ fSpent: 5, hSpent: 5, minutesGained: 60 });
    expect(s().ftoken).toBe(0);
    expect(s().htoken).toBe(0);
    expect(s().timePool).toBe(0);
    expect(s().todayPoolGained).toBe(0);
  });

  it("rejects when only one of F/H is short, even if the other has surplus", () => {
    s().settle({ fGained: 10, hGained: 0 }); // F=10, H=0
    s().recharge({ fSpent: 1, hSpent: 1, minutesGained: 30 });
    // H is short → whole call rejected; F not touched, pool unchanged.
    expect(s().ftoken).toBe(10);
    expect(s().htoken).toBe(0);
    expect(s().timePool).toBe(0);
    expect(s().todayPoolGained).toBe(0);
  });

  it("writes a `recharge` ledger entry on success with negative F/H + positive minutesDelta", () => {
    s().settle({ fGained: 5, hGained: 5 });
    const before = s().tokenHistory.length;
    s().recharge({ fSpent: 2, hSpent: 1, minutesGained: 30 });
    expect(s().tokenHistory.length).toBe(before + 1);
    expect(s().tokenHistory[0]).toMatchObject({
      kind: "recharge",
      fDelta: -2,
      hDelta: -1,
      minutesDelta: 30,
    });
  });

  it("writes no ledger entry when recharge is rejected (insufficient balance)", () => {
    const before = s().tokenHistory.length;
    s().recharge({ fSpent: 5, hSpent: 5, minutesGained: 60 });
    expect(s().tokenHistory.length).toBe(before);
  });
});

// ===========================================================================
// redeemWish
// ===========================================================================
describe("redeemWish", () => {
  function seedWish(extra: Partial<WishlistItem> = {}): string {
    s().addWish({
      name: extra.name ?? "Switch 2",
      price: extra.price ?? 100,
      pay: extra.pay ?? "F",
      why: extra.why ?? "treat yourself",
    });
    return s().wishlist[s().wishlist.length - 1].id;
  }

  it("addWish appends a wish with derived id and zero stored progress", () => {
    const id = seedWish({ name: "耳机", price: 299, pay: "mixed", why: "降噪" });
    expect(s().wishlist.find((w) => w.id === id)).toMatchObject({
      name: "耳机",
      price: 299,
      pay: "mixed",
      why: "降噪",
      progress: 0,
    });
    expect(id.startsWith("w-")).toBe(true);
  });

  it("removeWish drops only the matching wish", () => {
    const keepId = seedWish({ name: "书" });
    const removeId = seedWish({ name: "耳机" });
    s().removeWish(removeId);
    expect(s().wishlist.map((w) => w.id)).toEqual([keepId]);
  });

  it("is a no-op for an unknown wishId", () => {
    seedWish();
    const before = s();
    s().redeemWish({ wishId: "nope", fSpent: 0, hSpent: 0 });
    expect(s().wishlist.length).toBe(before.wishlist.length);
    expect(s().achievements.length).toBe(0);
  });

  it("is a no-op when F balance is insufficient (wish stays in list)", () => {
    const id = seedWish();
    // ftoken is 0 — try to spend 5
    s().redeemWish({ wishId: id, fSpent: 5, hSpent: 0 });
    expect(s().wishlist.find((w) => w.id === id)).toBeDefined();
    expect(s().achievements.length).toBe(0);
    expect(s().ftoken).toBe(0);
  });

  it("is a no-op when H balance is insufficient, even with enough F", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().endSession({ completedCount: 10 }); // +10F
    const id = seedWish();

    s().redeemWish({ wishId: id, fSpent: 5, hSpent: 1 });
    expect(s().wishlist.find((w) => w.id === id)).toBeDefined();
    expect(s().achievements.length).toBe(0);
    expect(s().ftoken).toBe(10);
    expect(s().htoken).toBe(0);
  });

  it("on success: deducts F/H, removes from wishlist, prepends achievement", () => {
    // Earn enough F first.
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().endSession({ completedCount: 10 }); // +10F
    s().settle({ fGained: 0, hGained: 5 }); // +5H
    const id = seedWish({ name: "Switch 2", price: 200, why: "fun" });

    s().redeemWish({ wishId: id, fSpent: 6, hSpent: 2 });
    expect(s().ftoken).toBe(4);
    expect(s().htoken).toBe(3);
    expect(s().wishlist.find((w) => w.id === id)).toBeUndefined();
    expect(s().achievements[0].id).toBe(id);
    expect(s().achievements[0].name).toBe("Switch 2");
  });

  it("writes a `wish` ledger entry on success with refId pointing at the wish", () => {
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().endSession({ completedCount: 10 });
    s().settle({ fGained: 0, hGained: 5 });
    const id = seedWish({ name: "Switch 2", price: 200, why: "fun" });
    const before = s().tokenHistory.length;

    s().redeemWish({ wishId: id, fSpent: 6, hSpent: 2 });
    expect(s().tokenHistory.length).toBe(before + 1);
    expect(s().tokenHistory[0]).toMatchObject({
      kind: "wish",
      fDelta: -6,
      hDelta: -2,
      note: "Switch 2",
      refId: id,
    });
  });
});

// ===========================================================================
// moveKanbanCard
// ===========================================================================
describe("moveKanbanCard", () => {
  function seedCard(col: "inbox" | "Q1" | "Q2" | "Q3" | "Q4", id: string) {
    const card: KanbanCard = { id, name: id };
    s().addKanbanCard({ col, card });
  }

  it("moves a card from inbox → Q1", () => {
    seedCard("inbox", "c1");
    s().moveKanbanCard({ cardId: "c1", toCol: "Q1" });
    expect(s().kanban.inbox.find((c) => c.id === "c1")).toBeUndefined();
    expect(s().kanban.Q1.find((c) => c.id === "c1")).toBeDefined();
  });

  it("is a no-op when the cardId doesn't exist", () => {
    seedCard("inbox", "c1");
    const before = JSON.stringify(s().kanban);
    s().moveKanbanCard({ cardId: "ghost", toCol: "Q1" });
    expect(JSON.stringify(s().kanban)).toBe(before);
  });

  it("removes from source column on a Q1 → Q3 cross-column move", () => {
    seedCard("Q1", "c1");
    s().moveKanbanCard({ cardId: "c1", toCol: "Q3" });
    expect(s().kanban.Q1.find((c) => c.id === "c1")).toBeUndefined();
    expect(s().kanban.Q3.find((c) => c.id === "c1")).toBeDefined();
  });
});

// ===========================================================================
// foodPresets
// ===========================================================================
describe("foodPresets", () => {
  it("addFoodPreset appends a preset with a fp- id", () => {
    const before = s().foodPresets.length;
    s().addFoodPreset({ name: "咖啡", price: 12 });
    const after = s().foodPresets;
    expect(after.length).toBe(before + 1);
    const added = after[after.length - 1];
    expect(added.name).toBe("咖啡");
    expect(added.price).toBe(12);
    expect(added.id.startsWith("fp-")).toBe(true);
  });

  it("updateFoodPreset patches an existing preset by id", () => {
    s().addFoodPreset({ name: "咖啡", price: 12 });
    const target = s().foodPresets[s().foodPresets.length - 1];
    s().updateFoodPreset(target.id, { price: 15 });
    const found = s().foodPresets.find((p) => p.id === target.id)!;
    expect(found.price).toBe(15);
    expect(found.name).toBe("咖啡");
  });

  it("removeFoodPreset drops the preset by id", () => {
    s().addFoodPreset({ name: "咖啡", price: 12 });
    const target = s().foodPresets[s().foodPresets.length - 1];
    s().removeFoodPreset(target.id);
    expect(s().foodPresets.find((p) => p.id === target.id)).toBeUndefined();
  });
});

// ===========================================================================
// startPlay / endPlay
// ===========================================================================
describe("play session lifecycle", () => {
  it("startPlay uses minutes as the default cost", () => {
    s().recharge({ fSpent: 0, hSpent: 0, minutesGained: 20 });
    s().startPlay({ type: "active", minutes: 15 });
    expect(s().timePool).toBe(5);
    expect(s().playSession).toMatchObject({
      type: "active",
      totalMinutes: 15,
      costMinutes: 15,
    });
  });

  it("startPlay caps deduction at the available timePool", () => {
    // Seed timePool to exactly 10.
    s().recharge({ fSpent: 0, hSpent: 0, minutesGained: 10 });
    expect(s().timePool).toBe(10);

    s().startPlay({ type: "passive", minutes: 30, costMinutes: 30 });
    expect(s().timePool).toBe(0); // capped, not negative
    const ps = s().playSession!;
    expect(ps).not.toBeNull();
    expect(ps.type).toBe("passive");
    expect(ps.totalMinutes).toBe(30);
    expect(ps.costMinutes).toBe(10); // actualCost was clamped
  });

  it("endPlay clears the session and refunds remaining minutes", () => {
    s().recharge({ fSpent: 0, hSpent: 0, minutesGained: 30 });
    s().startPlay({ type: "active", minutes: 30, costMinutes: 30 });
    expect(s().timePool).toBe(0);

    s().endPlay({ refundMinutes: 5 });
    expect(s().playSession).toBe(null);
    expect(s().timePool).toBe(5);
  });

  it("startPlay writes a `play` ledger entry with negative minutesDelta when actualCost > 0", () => {
    s().recharge({ fSpent: 0, hSpent: 0, minutesGained: 20 });
    const before = s().tokenHistory.length;
    s().startPlay({ type: "active", minutes: 15 });
    expect(s().tokenHistory.length).toBe(before + 1);
    expect(s().tokenHistory[0]).toMatchObject({
      kind: "play",
      minutesDelta: -15,
      note: "active",
    });
  });

  it("startPlay does NOT write a ledger entry when actualCost is 0 (empty pool)", () => {
    const before = s().tokenHistory.length;
    s().startPlay({ type: "passive", minutes: 30, costMinutes: 30 });
    expect(s().tokenHistory.length).toBe(before);
  });

  it("endPlay writes a `play` refund ledger entry with positive minutesDelta", () => {
    s().recharge({ fSpent: 0, hSpent: 0, minutesGained: 30 });
    s().startPlay({ type: "active", minutes: 30, costMinutes: 30 });
    const beforeRefund = s().tokenHistory.length;
    s().endPlay({ refundMinutes: 5 });
    expect(s().tokenHistory.length).toBe(beforeRefund + 1);
    expect(s().tokenHistory[0]).toMatchObject({
      kind: "play",
      minutesDelta: 5,
      note: "refund",
    });
  });

  it("endPlay does NOT write a refund ledger entry when refundMinutes is 0", () => {
    s().recharge({ fSpent: 0, hSpent: 0, minutesGained: 30 });
    s().startPlay({ type: "active", minutes: 30, costMinutes: 30 });
    const before = s().tokenHistory.length;
    s().endPlay();
    expect(s().tokenHistory.length).toBe(before);
  });
});

// ===========================================================================
// auto-sync (lastSavedAt + markSynced + applyCloudSnapshot)
// ===========================================================================
describe("auto-sync helpers", () => {
  it("starter state has lastSavedAt = 0 ('never synced')", () => {
    expect(s().lastSavedAt).toBe(0);
  });

  it("markSynced advances lastSavedAt monotonically — older savedAt is ignored", () => {
    s().markSynced(1000);
    expect(s().lastSavedAt).toBe(1000);
    s().markSynced(500); // older — must not regress
    expect(s().lastSavedAt).toBe(1000);
    s().markSynced(2000);
    expect(s().lastSavedAt).toBe(2000);
  });

  it("applyCloudSnapshot replaces local state and stamps lastSavedAt with the cloud savedAt", () => {
    s().settle({ fGained: 9, hGained: 9 });
    s().addWish({ name: "本地", price: 10, pay: "F", why: "local" });
    expect(s().wishlist.length).toBe(1);

    s().applyCloudSnapshot(
      {
        ftoken: 42,
        wishlist: [
          {
            id: "w-cloud",
            name: "云端",
            price: 1,
            pay: "F",
            why: "cloud",
            progress: 0,
          },
        ],
      },
      99_999,
    );
    expect(s().ftoken).toBe(42);
    expect(s().htoken).toBe(0); // missing in cloud snapshot → defaults take over
    expect(s().wishlist).toEqual([
      {
        id: "w-cloud",
        name: "云端",
        price: 1,
        pay: "F",
        why: "cloud",
        progress: 0,
      },
    ]);
    expect(s().lastSavedAt).toBe(99_999);
  });

  it("reset returns lastSavedAt to 0", () => {
    s().markSynced(12345);
    expect(s().lastSavedAt).toBe(12345);
    s().reset();
    expect(s().lastSavedAt).toBe(0);
  });
});

// ===========================================================================
// applyMergedSnapshot (v9+ default sync path)
// ===========================================================================
describe("applyMergedSnapshot", () => {
  function ledgerEntry(over: Partial<{
    id: string;
    kind: "welcome" | "pomodoro" | "settle" | "recharge" | "food" | "wish" | "play" | "rollup";
    fDelta: number;
    hDelta: number;
    minutesDelta: number;
    createdAt: number;
    dayKey: string;
  }> = {}): {
    id: string;
    kind: "welcome" | "pomodoro" | "settle" | "recharge" | "food" | "wish" | "play" | "rollup";
    fDelta: number;
    hDelta: number;
    minutesDelta?: number;
    createdAt: number;
    dayKey: string;
  } {
    return {
      id: over.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
      kind: over.kind ?? "pomodoro",
      fDelta: over.fDelta ?? 0,
      hDelta: over.hDelta ?? 0,
      minutesDelta: over.minutesDelta,
      createdAt: over.createdAt ?? 1_000,
      dayKey: over.dayKey ?? "2026-05-03",
    };
  }

  it("balance = cloud baseline + local entries created after local.lastSavedAt", () => {
    // Local: lastSavedAt=1000, two ledger entries created after that.
    useStore.setState({
      ftoken: 8,
      htoken: 5,
      timePool: 0,
      lastSavedAt: 1000,
      tokenHistory: [
        ledgerEntry({ id: "p-old", kind: "pomodoro", fDelta: 1, createdAt: 500 }),
        ledgerEntry({ id: "p-new1", kind: "pomodoro", fDelta: 2, createdAt: 1500 }),
        ledgerEntry({ id: "p-new2", kind: "pomodoro", fDelta: 1, createdAt: 1800 }),
      ],
    });
    s().applyMergedSnapshot(
      {
        ftoken: 10,
        htoken: 5,
        timePool: 30,
        tokenHistory: [
          ledgerEntry({ id: "p-old", kind: "pomodoro", fDelta: 1, createdAt: 500 }),
          ledgerEntry({ id: "cloud-1", kind: "pomodoro", fDelta: 4, createdAt: 800 }),
        ],
      },
      2000,
    );
    // mergedF = cloud.ftoken (10) + local-new (2 + 1) = 13
    expect(s().ftoken).toBe(13);
    expect(s().htoken).toBe(5);
    expect(s().timePool).toBe(30);
    expect(s().lastSavedAt).toBe(2000);
  });

  it("does NOT re-credit local entries that cloud rolled up out of view (time-filter, not id-filter)", () => {
    // Scenario: cloud rolled up old entries beyond its history horizon.
    // cloud.tokenHistory no longer contains them; cloud.ftoken DOES
    // include them via the rollup. Local still has the raw entries
    // because it hasn't run rollup yet. The merge must NOT add their
    // deltas a second time on top of cloud.ftoken.
    useStore.setState({
      lastSavedAt: 5000,
      ftoken: 10,
      tokenHistory: [
        // Old local entry, already accounted for in cloud's accumulated
        // baseline (cloud rolled it up + the rollup may itself live in
        // cloud.tokenHistory, but the raw entry doesn't).
        ledgerEntry({
          id: "p-old-rolled",
          kind: "pomodoro",
          fDelta: 4,
          createdAt: 1000,
        }),
      ],
    });
    s().applyMergedSnapshot(
      {
        ftoken: 10,
        tokenHistory: [], // cloud's view doesn't surface the old entry
      },
      6000,
    );
    // Old local entry's createdAt (1000) is NOT > local.lastSavedAt (5000),
    // so it doesn't contribute. Result: cloud baseline preserved.
    expect(s().ftoken).toBe(10);
  });

  it("id-dedups tokenHistory union; cloud entry wins on collision", () => {
    useStore.setState({
      lastSavedAt: 1000,
      tokenHistory: [ledgerEntry({ id: "shared", fDelta: 1, createdAt: 500 })],
    });
    s().applyMergedSnapshot(
      {
        ftoken: 0,
        tokenHistory: [
          ledgerEntry({ id: "shared", fDelta: 1, createdAt: 500 }),
          ledgerEntry({ id: "cloud-only", kind: "pomodoro", fDelta: 2, createdAt: 800 }),
        ],
      },
      2000,
    );
    expect(s().tokenHistory.map((e) => e.id).sort()).toEqual(["cloud-only", "shared"]);
  });

  it("welcome dedup: keeps earliest welcome and reverses dropped delta from balance", () => {
    useStore.setState({
      ftoken: 5,
      htoken: 10,
      lastSavedAt: 0,
      tokenHistory: [
        ledgerEntry({
          id: "w-anon",
          kind: "welcome",
          fDelta: 5,
          hDelta: 10,
          createdAt: 200,
        }),
      ],
    });
    s().applyMergedSnapshot(
      {
        ftoken: 5,
        htoken: 10,
        tokenHistory: [
          ledgerEntry({
            id: "w-cloud",
            kind: "welcome",
            fDelta: 5,
            hDelta: 10,
            createdAt: 100,
          }),
        ],
      },
      1000,
    );
    // merged ledger initially has both welcome ids; dedupWelcomeEntries
    // collapses to earliest (w-cloud) and reports fAdjust=-5/hAdjust=-10
    // (the dropped w-anon's deltas, negated). Balance math:
    //   cloud (5,10) + localOnly w-anon (+5,+10) + welcome dedup (-5,-10)
    //   = (5,10) — i.e. exactly one welcome's worth, not double.
    expect(s().ftoken).toBe(5);
    expect(s().htoken).toBe(10);
    const welcomes = s().tokenHistory.filter((e) => e.kind === "welcome");
    expect(welcomes).toHaveLength(1);
    expect(welcomes[0].id).toBe("w-cloud");
  });

  it("dedups id-keyed collections (wishlist, kanban inbox, foodPresets)", () => {
    useStore.setState({
      wishlist: [
        { id: "w-1", name: "本地", price: 10, pay: "F", why: "local", progress: 0 },
      ],
      foodPresets: [
        { id: "fp-shared", name: "本地版", price: 5 },
      ],
      kanban: { inbox: [{ id: "k1", name: "本地任务" }], Q1: [], Q2: [], Q3: [], Q4: [] },
    });
    s().applyMergedSnapshot(
      {
        wishlist: [
          { id: "w-1", name: "云端", price: 10, pay: "F", why: "云", progress: 0 },
          { id: "w-2", name: "新", price: 5, pay: "H", why: "y", progress: 0 },
        ],
        foodPresets: [
          { id: "fp-shared", name: "云版", price: 5 },
          { id: "fp-cloud", name: "新", price: 8 },
        ],
        kanban: {
          inbox: [{ id: "k1", name: "云端任务" }, { id: "k2", name: "k2" }],
          Q1: [], Q2: [], Q3: [], Q4: [],
        },
      },
      2000,
    );
    expect(s().wishlist.map((w) => w.id).sort()).toEqual(["w-1", "w-2"]);
    expect(s().wishlist.find((w) => w.id === "w-1")?.name).toBe("云端"); // cloud wins
    expect(s().foodPresets.map((p) => p.id).sort()).toEqual(["fp-cloud", "fp-shared"]);
    expect(s().kanban.inbox.map((c) => c.id).sort()).toEqual(["k1", "k2"]);
  });

  it("is idempotent — re-running with the same cloud snapshot doesn't grow ledger", () => {
    const cloud = {
      ftoken: 5,
      htoken: 10,
      tokenHistory: [
        ledgerEntry({ id: "cloud-1", fDelta: 1, createdAt: 500 }),
      ],
    };
    s().applyMergedSnapshot(cloud, 1000);
    const lenAfterFirst = s().tokenHistory.length;
    const fAfterFirst = s().ftoken;
    s().applyMergedSnapshot(cloud, 1000);
    expect(s().tokenHistory.length).toBe(lenAfterFirst);
    expect(s().ftoken).toBe(fAfterFirst);
  });
});

// ===========================================================================
// runRollup
// ===========================================================================
describe("runRollup", () => {
  it("collapses entries older than 30 days into per-day rollup entries", () => {
    const now = Date.now();
    const old1 = now - 40 * 86400000;
    const old2 = now - 41 * 86400000;
    const recent = now - 5 * 86400000;
    useStore.setState({
      tokenHistory: [
        {
          id: "r-1",
          kind: "pomodoro",
          fDelta: 1,
          hDelta: 0,
          createdAt: recent,
          dayKey: "2026-04-28",
        },
        {
          id: "o-1",
          kind: "pomodoro",
          fDelta: 0.5,
          hDelta: 0,
          createdAt: old1,
          dayKey: "2026-03-24",
        },
        {
          id: "o-2",
          kind: "pomodoro",
          fDelta: 1,
          hDelta: 0,
          createdAt: old1 + 1000,
          dayKey: "2026-03-24",
        },
        {
          id: "o-3",
          kind: "settle",
          fDelta: 0,
          hDelta: 3,
          createdAt: old2,
          dayKey: "2026-03-23",
        },
      ],
    });
    s().runRollup();
    const rollups = s().tokenHistory.filter((e) => e.kind === "rollup");
    expect(rollups).toHaveLength(2);
    const r0324 = rollups.find((r) => r.dayKey === "2026-03-24")!;
    expect(r0324.fDelta).toBe(1.5);
    expect(r0324.id).toBe("rollup-2026-03-24");
    // Recent entry preserved as-is.
    expect(s().tokenHistory.find((e) => e.id === "r-1")).toBeTruthy();
    // Old originals consumed.
    expect(s().tokenHistory.find((e) => e.id === "o-1")).toBeUndefined();
  });

  it("is a no-op when nothing is older than 30 days", () => {
    const now = Date.now();
    useStore.setState({
      tokenHistory: [
        {
          id: "r-1",
          kind: "pomodoro",
          fDelta: 1,
          hDelta: 0,
          createdAt: now - 86400000,
          dayKey: "2026-05-02",
        },
      ],
    });
    const before = s().tokenHistory;
    s().runRollup();
    expect(s().tokenHistory).toEqual(before);
  });
});

// ===========================================================================
// reset
// ===========================================================================
describe("reset", () => {
  it("returns balances, sessions, and user collections to starter state", () => {
    s().grantWelcomeBonus();
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().addWish({ name: "耳机", price: 299, pay: "F", why: "降噪" });
    s().addKanbanCard({ col: "inbox", card: { id: "c1", name: "任务" } });

    s().reset();
    expect(s().ftoken).toBe(0);
    expect(s().htoken).toBe(0);
    expect(s().session).toBeNull();
    expect(s().wishlist).toEqual([]);
    expect(s().kanban.inbox).toEqual([]);
    expect(s().tokenHistory).toEqual([]);
    expect(s().foodPresets.map((p) => p.name)).toEqual(["可乐", "雪糕"]);
  });
});
