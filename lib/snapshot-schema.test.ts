/**
 * Pure-unit tests for the snapshot validator. No I/O, no env.
 *
 * The snapshot is the trust boundary for cloud-sync — these tests
 * pin down the strict shape so a future field addition can't silently
 * widen the surface area without updating both `partialize` AND this
 * schema.
 */

import { describe, expect, it } from "bun:test";
import {
  MAX_SNAPSHOT_BYTES,
  persistedSnapshotSchema,
} from "./snapshot-schema";

function validSnapshot() {
  return {
    ftoken: 0,
    htoken: 0,
    timePool: 0,
    lastSettledDate: null,
    activeDay: "2026-05-03",
    session: null,
    playSession: null,
    todayMathPomos: 0,
    todayPomos: 0,
    todayFGained: 0,
    todayHGained: 0,
    todayPoolGained: 0,
    welcomeGrantedUserIds: [],
    lastSavedAt: 0,
    pomodoroHistory: [],
    tokenHistory: [],
    wishlist: [],
    achievements: [],
    kanban: { inbox: [], Q1: [], Q2: [], Q3: [], Q4: [] },
    recentTasks: [],
    foodPresets: [],
  };
}

describe("persistedSnapshotSchema — happy path", () => {
  it("accepts the minimal valid snapshot", () => {
    expect(persistedSnapshotSchema.safeParse(validSnapshot()).success).toBe(true);
  });

  it("accepts a populated session and playSession", () => {
    const snap = validSnapshot();
    snap.session = {
      task: "刷题",
      tag: "math",
      type: "input",
      startedAt: 1_700_000_000_000,
      phaseStartedAt: 1_700_000_000_000,
      count: 3,
      mode: "running",
      notes: ["卡在第 3 题"],
    } as never;
    snap.playSession = {
      type: "active",
      totalMinutes: 30,
      costMinutes: 30,
      startedAt: 1_700_000_000_000,
    } as never;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("accepts session.phaseStartedAt as optional (back-compat for v2 migration)", () => {
    const snap = validSnapshot();
    snap.session = {
      task: "刷题",
      tag: "math",
      type: "input",
      startedAt: 1_700_000_000_000,
      // no phaseStartedAt — should be allowed (optional)
      count: 1,
      mode: "running",
      notes: [],
    } as never;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(true);
  });
});

describe("persistedSnapshotSchema — v1.7 backward compat", () => {
  it("accepts a snapshot from a v1.7 client that still emits guideSeenUserIds", () => {
    const snap = validSnapshot() as Record<string, unknown>;
    snap.guideSeenUserIds = ["user-a"];
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(true);
  });
});

describe("persistedSnapshotSchema — strictness", () => {
  it("rejects unknown top-level keys", () => {
    const bad = { ...validSnapshot(), evil: "payload" } as never;
    const r = persistedSnapshotSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it("documents that nested z.object() is NOT strict — extra keys on kanban pass through", () => {
    // The outer schema is .strict(); inner objects (kanban, kanban cards,
    // wishlist items, etc.) are not. A future tightening would add .strict()
    // to each — until then a tampered client could smuggle unknown fields
    // into nested objects (they'd just bloat KV up to MAX_SNAPSHOT_BYTES).
    const snap = validSnapshot();
    (snap.kanban as Record<string, unknown>).Q5 = [];
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("rejects an invalid tagId", () => {
    const snap = validSnapshot();
    snap.session = {
      task: "刷题",
      tag: "history" as never, // not in the enum
      type: "input",
      startedAt: 1,
      phaseStartedAt: 1,
      count: 1,
      mode: "running",
      notes: [],
    } as never;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects malformed dayKey on activeDay", () => {
    const snap = validSnapshot();
    snap.activeDay = "2026-5-3"; // missing zero-pad
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    const snap = validSnapshot();
    snap.ftoken = NaN;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects Infinity in numeric fields", () => {
    const snap = validSnapshot();
    snap.timePool = Infinity;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects ftoken outside the [-1e6, 1e6] band", () => {
    const snap = validSnapshot();
    snap.ftoken = 2_000_000;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects pomodoroHistory longer than its array cap", () => {
    const snap = validSnapshot();
    const record = {
      id: "p-1",
      task: "x",
      tag: "cs" as const,
      type: "input" as const,
      count: 1,
      minutes: 25,
      fGained: 1,
      bonusF: 0,
      startedAt: 1,
      endedAt: 2,
      dayKey: "2026-05-03",
    };
    snap.pomodoroHistory = new Array(1_001).fill(record) as never;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects when lastSavedAt is missing (auto-sync watermark must ride)", () => {
    const snap = validSnapshot() as Record<string, unknown>;
    delete snap.lastSavedAt;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects negative lastSavedAt", () => {
    const snap = validSnapshot();
    snap.lastSavedAt = -1;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });

  it("rejects a wishlist item with progress > 1", () => {
    const snap = validSnapshot();
    snap.wishlist = [
      {
        id: "w-1",
        name: "x",
        price: 1,
        pay: "F",
        why: "y",
        progress: 2, // out of [0,1]
      },
    ] as never;
    expect(persistedSnapshotSchema.safeParse(snap).success).toBe(false);
  });
});

describe("MAX_SNAPSHOT_BYTES", () => {
  it("is set to 256 KB", () => {
    expect(MAX_SNAPSHOT_BYTES).toBe(256 * 1024);
  });

  it("a minimal snapshot serializes well under the cap", () => {
    expect(JSON.stringify(validSnapshot()).length).toBeLessThan(MAX_SNAPSHOT_BYTES);
  });
});
