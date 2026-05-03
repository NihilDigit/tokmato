import { describe, expect, it } from "bun:test";
import {
  recomputeBalances,
  dedupWelcomeEntries,
  rolledUpEntries,
  rollupIdFor,
} from "./ledger";
import type { TokenLedgerEntry } from "./types";

function entry(over: Partial<TokenLedgerEntry>): TokenLedgerEntry {
  return {
    id: over.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
    kind: over.kind ?? "pomodoro",
    fDelta: over.fDelta ?? 0,
    hDelta: over.hDelta ?? 0,
    createdAt: over.createdAt ?? 1_700_000_000_000,
    dayKey: over.dayKey ?? "2026-05-03",
    ...over,
  };
}

describe("recomputeBalances", () => {
  it("sums F / H / minutes deltas across kinds", () => {
    expect(
      recomputeBalances([
        entry({ kind: "welcome", fDelta: 5, hDelta: 10 }),
        entry({ kind: "pomodoro", fDelta: 1, hDelta: 0 }),
        entry({ kind: "settle", fDelta: 0, hDelta: 3 }),
        entry({ kind: "recharge", fDelta: -2, hDelta: -1, minutesDelta: 30 }),
        entry({ kind: "play", minutesDelta: -25 }),
      ]),
    ).toEqual({ ftoken: 4, htoken: 12, timePool: 5 });
  });

  it("returns zero on empty input", () => {
    expect(recomputeBalances([])).toEqual({ ftoken: 0, htoken: 0, timePool: 0 });
  });

  it("ignores undefined minutesDelta on F/H-only kinds", () => {
    const r = recomputeBalances([entry({ kind: "pomodoro", fDelta: 2 })]);
    expect(r.timePool).toBe(0);
  });
});

describe("dedupWelcomeEntries", () => {
  it("returns input unchanged with zero adjust when ≤1 welcome entry", () => {
    const single = [
      entry({ kind: "welcome", fDelta: 5, hDelta: 10, createdAt: 1 }),
      entry({ kind: "pomodoro", fDelta: 1 }),
    ];
    const r = dedupWelcomeEntries(single);
    expect(r.entries).toBe(single);
    expect(r.fAdjust).toBe(0);
    expect(r.hAdjust).toBe(0);
  });

  it("keeps the earliest welcome and reports negated dropped deltas", () => {
    const r = dedupWelcomeEntries([
      entry({ id: "w-anon", kind: "welcome", fDelta: 5, hDelta: 10, createdAt: 200 }),
      entry({ id: "w-cloud", kind: "welcome", fDelta: 5, hDelta: 10, createdAt: 100 }),
      entry({ kind: "pomodoro", fDelta: 1 }),
    ]);
    const remainingWelcomes = r.entries.filter((e) => e.kind === "welcome");
    expect(remainingWelcomes).toHaveLength(1);
    expect(remainingWelcomes[0].id).toBe("w-cloud"); // earliest
    // Dropped one welcome: -5F -10H to undo it from balance
    expect(r.fAdjust).toBe(-5);
    expect(r.hAdjust).toBe(-10);
  });

  it("preserves ordering of non-welcome entries", () => {
    const orig = [
      entry({ id: "w1", kind: "welcome", fDelta: 5, hDelta: 10, createdAt: 100 }),
      entry({ id: "p1", kind: "pomodoro", fDelta: 1, createdAt: 150 }),
      entry({ id: "w2", kind: "welcome", fDelta: 5, hDelta: 10, createdAt: 200 }),
      entry({ id: "p2", kind: "pomodoro", fDelta: 1, createdAt: 250 }),
    ];
    const r = dedupWelcomeEntries(orig);
    const ids = r.entries.map((e) => e.id);
    expect(ids).toEqual(["w1", "p1", "p2"]);
  });
});

describe("rolledUpEntries", () => {
  const cutoff = 30 * 86400 * 1000;
  const now = 100 * 86400 * 1000;
  const old = (createdAt: number, fDelta: number, hDelta: number, dayKey: string) =>
    entry({ createdAt, fDelta, hDelta, dayKey });

  it("returns input unchanged when nothing is older than cutoff", () => {
    const young = [
      entry({ createdAt: now - 1, dayKey: "2026-05-03", fDelta: 1 }),
      entry({ createdAt: now - 86400000, dayKey: "2026-05-02", fDelta: 0.5 }),
    ];
    expect(rolledUpEntries(young, cutoff)).toBe(young);
  });

  it("groups old entries by dayKey into a single rollup per day", () => {
    const r = rolledUpEntries(
      [
        old(10, 1, 0, "2026-04-01"),
        old(20, 0.5, 0, "2026-04-01"),
        old(15, 0, 5, "2026-04-02"),
        entry({ createdAt: now, dayKey: "2026-05-03", fDelta: 1 }),
      ],
      cutoff,
    );
    const rollups = r.filter((e) => e.kind === "rollup");
    expect(rollups).toHaveLength(2);
    const apr1 = rollups.find((x) => x.dayKey === "2026-04-01")!;
    expect(apr1.fDelta).toBe(1.5);
    expect(apr1.hDelta).toBe(0);
    expect(apr1.id).toBe("rollup-2026-04-01");
    const apr2 = rollups.find((x) => x.dayKey === "2026-04-02")!;
    expect(apr2.hDelta).toBe(5);
    // Young entry preserved
    expect(r.find((x) => x.kind === "pomodoro")).toBeTruthy();
  });

  it("is idempotent when re-run on already-rolled output", () => {
    const once = rolledUpEntries(
      [
        old(10, 1, 0, "2026-04-01"),
        old(20, 0.5, 0, "2026-04-01"),
        entry({ createdAt: now, dayKey: "2026-05-03", fDelta: 1 }),
      ],
      cutoff,
    );
    const twice = rolledUpEntries(once, cutoff);
    expect(twice).toEqual(once);
  });

  it("folds an existing rollup back into a fresh rollup if more old entries surface", () => {
    const existingRollup: TokenLedgerEntry = {
      id: rollupIdFor("2026-04-01"),
      kind: "rollup",
      fDelta: 1.5,
      hDelta: 0,
      createdAt: 10,
      dayKey: "2026-04-01",
    };
    const newOld = old(25, 2, 1, "2026-04-01");
    const r = rolledUpEntries([existingRollup, newOld], cutoff);
    const rollups = r.filter((e) => e.kind === "rollup");
    expect(rollups).toHaveLength(1);
    expect(rollups[0].fDelta).toBe(3.5);
    expect(rollups[0].hDelta).toBe(1);
  });

  it("omits minutesDelta when summed minutes are zero", () => {
    const r = rolledUpEntries(
      [old(5, 1, 0, "2026-04-01"), old(6, 0.5, 0, "2026-04-01")],
      cutoff,
    );
    const rollup = r.find((e) => e.kind === "rollup")!;
    expect(rollup.minutesDelta).toBeUndefined();
  });

  it("emits minutesDelta when non-zero", () => {
    const r = rolledUpEntries(
      [
        entry({ createdAt: 5, dayKey: "2026-04-01", minutesDelta: 30 }),
        entry({ createdAt: 6, dayKey: "2026-04-01", minutesDelta: -15 }),
      ],
      cutoff,
    );
    const rollup = r.find((e) => e.kind === "rollup")!;
    expect(rollup.minutesDelta).toBe(15);
  });
});
