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
// markGuideSeen
// ===========================================================================
describe("markGuideSeen", () => {
  it("appends the userId on first call", () => {
    s().markGuideSeen("user-a");
    expect(s().guideSeenUserIds).toEqual(["user-a"]);
  });

  it("is idempotent for the same userId", () => {
    s().markGuideSeen("user-a");
    s().markGuideSeen("user-a");
    expect(s().guideSeenUserIds).toEqual(["user-a"]);
  });

  it("tracks distinct userIds independently", () => {
    s().markGuideSeen("user-a");
    s().markGuideSeen("user-b");
    expect(s().guideSeenUserIds).toEqual(["user-a", "user-b"]);
  });

  it("is a no-op for empty-string userId", () => {
    s().markGuideSeen("");
    expect(s().guideSeenUserIds).toEqual([]);
  });
});

// ===========================================================================
// grantWelcomeBonus
// ===========================================================================
describe("grantWelcomeBonus", () => {
  it("grants +5F / +10H and writes a welcome ledger entry on first call", () => {
    s().grantWelcomeBonus("user-a");
    const st = s();
    expect(st.ftoken).toBe(5);
    expect(st.htoken).toBe(10);
    expect(st.welcomeGrantedUserIds).toEqual(["user-a"]);
    expect(st.tokenHistory.length).toBe(1);
    expect(st.tokenHistory[0].kind).toBe("welcome");
    expect(st.tokenHistory[0].fDelta).toBe(5);
    expect(st.tokenHistory[0].hDelta).toBe(10);
  });

  it("is idempotent for the same userId", () => {
    s().grantWelcomeBonus("user-a");
    const fAfterFirst = s().ftoken;
    const hAfterFirst = s().htoken;
    const histLen = s().tokenHistory.length;
    s().grantWelcomeBonus("user-a");
    expect(s().ftoken).toBe(fAfterFirst);
    expect(s().htoken).toBe(hAfterFirst);
    expect(s().tokenHistory.length).toBe(histLen);
    expect(s().welcomeGrantedUserIds).toEqual(["user-a"]);
  });

  it("grants once per distinct userId — different account on same device gets +5F/+10H once, then is locked", () => {
    s().grantWelcomeBonus("user-a");
    s().grantWelcomeBonus("user-b");
    // Each user grants once; balances reflect two distinct grants.
    expect(s().ftoken).toBe(10);
    expect(s().htoken).toBe(20);
    expect(s().welcomeGrantedUserIds).toEqual(["user-a", "user-b"]);
    expect(s().tokenHistory.filter((e) => e.kind === "welcome").length).toBe(2);

    // Second pass with the same two users must stay idempotent — no farming.
    s().grantWelcomeBonus("user-a");
    s().grantWelcomeBonus("user-b");
    expect(s().ftoken).toBe(10);
    expect(s().htoken).toBe(20);
    expect(s().welcomeGrantedUserIds).toEqual(["user-a", "user-b"]);
    expect(s().tokenHistory.filter((e) => e.kind === "welcome").length).toBe(2);
  });

  it("is a no-op for empty-string userId", () => {
    s().grantWelcomeBonus("");
    expect(s().ftoken).toBe(0);
    expect(s().htoken).toBe(0);
    expect(s().welcomeGrantedUserIds).toEqual([]);
    expect(s().tokenHistory.length).toBe(0);
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
      todayMathPomos: 2,
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
    expect(s().todayMathPomos).toBe(0);
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
    // Pre-seed: bring todayMathPomos to 4 by ending an input math session.
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 4 });
    // ftoken so far: 4 (input math, no milestone crossed: 4 < 5 → bonus 0)
    expect(s().todayMathPomos).toBe(4);
    expect(s().ftoken).toBe(4);

    // Now do another 2 pomos → math goes 4 → 6, crossing milestone 5.
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 2 });
    expect(s().todayMathPomos).toBe(6);
    // +2 base (input) + 1 bonus = +3
    expect(s().ftoken).toBe(4 + 3);
    const lastRecord = s().pomodoroHistory[0];
    expect(lastRecord.bonusF).toBe(1);
    expect(lastRecord.fGained).toBe(2);
  });

  it("math tag crossing 5 AND 7 milestones (4→7) awards +2 bonus", () => {
    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 4 });
    expect(s().todayMathPomos).toBe(4);

    s().startSession({ task: "高数", tag: "math", type: "input" });
    s().endSession({ completedCount: 3 });
    expect(s().todayMathPomos).toBe(7);
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
    expect(s().todayMathPomos).toBe(6);
    expect(s().pomodoroHistory[0].bonusF).toBe(0);
  });

  it("non-math tag earns no milestone bonus even at high pomo counts", () => {
    s().startSession({ task: "刷英语", tag: "english", type: "input" });
    s().endSession({ completedCount: 6 });
    expect(s().todayMathPomos).toBe(0);
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
// reset
// ===========================================================================
describe("reset", () => {
  it("returns balances, sessions, and user collections to starter state", () => {
    s().grantWelcomeBonus("user-a");
    s().startSession({ task: "刷题", tag: "cs", type: "input" });
    s().addWish({ name: "耳机", price: 299, pay: "F", why: "降噪" });
    s().addKanbanCard({ col: "inbox", card: { id: "c1", name: "任务" } });

    s().reset();
    expect(s().ftoken).toBe(0);
    expect(s().htoken).toBe(0);
    expect(s().session).toBeNull();
    expect(s().welcomeGrantedUserIds).toEqual([]);
    expect(s().wishlist).toEqual([]);
    expect(s().kanban.inbox).toEqual([]);
    expect(s().foodPresets.map((p) => p.name)).toEqual(["可乐", "雪糕"]);
  });
});
