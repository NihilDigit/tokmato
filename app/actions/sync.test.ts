/**
 * Smoke tests for sync server actions — talks to real Upstash Redis.
 * Auth is the only mocked layer; everything else is the production path.
 *
 * Namespaced under `tokmato:user:test-sync:*` so tests don't collide
 * with real user state. Each test cleans up before and after.
 */

import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const TEST_USER_ID = "test-sync";

let session: { user?: { id?: string } } | null = { user: { id: TEST_USER_ID } };

mock.module("@/auth", () => ({
  auth: async () => session,
}));

const hasInfra = Boolean(
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
);
const describeIf = hasInfra ? describe : describe.skip;

/** Minimal valid snapshot matching `persistedSnapshotSchema`. */
function validSnapshot() {
  return {
    ftoken: 1,
    htoken: 0,
    timePool: 0,
    lastSettledDate: null,
    activeDay: "2026-05-03",
    session: null,
    playSession: null,
    todayPomos: 0,
    todayCountsByTag: {},
    todayFGained: 0,
    todayHGained: 0,
    todayPoolGained: 0,
    welcomeGrantedUserIds: [],
    tags: [],
    bonuses: [],
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

describeIf("sync server actions (real Redis)", async () => {
  const { saveToCloud, loadFromCloud } = await import("./sync");
  const { redis } = await import("@/lib/kv");

  const stateKey = `tokmato:user:${TEST_USER_ID}:state`;

  async function cleanup() {
    if (!redis) return;
    await redis.del(stateKey);
    // Drop any rate-limit buckets we may have written. They expire on
    // their own but leaving 30+ keys per run is loud in the dashboard.
    const bucket = Math.floor(Date.now() / 1000 / 60);
    for (let b = bucket - 1; b <= bucket + 1; b++) {
      await redis.del(`tokmato:user:${TEST_USER_ID}:sync-rl:${b}`);
    }
  }

  beforeEach(async () => {
    session = { user: { id: TEST_USER_ID } };
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("UNAUTHENTICATED short-circuits before touching Redis", async () => {
    session = null;
    await expect(saveToCloud(validSnapshot())).rejects.toThrow("UNAUTHENTICATED");
    await expect(loadFromCloud()).rejects.toThrow("UNAUTHENTICATED");
    // No state key written
    const stored = await redis!.get(stateKey);
    expect(stored).toBeNull();
  });

  it("INVALID_PAYLOAD on malformed snapshot, no write", async () => {
    await expect(saveToCloud({ ftoken: 1 })).rejects.toThrow("INVALID_PAYLOAD");
    expect(await redis!.get(stateKey)).toBeNull();
  });

  it("INVALID_PAYLOAD rejects unknown top-level keys (strict schema)", async () => {
    const bad = { ...validSnapshot(), evil: "payload" };
    await expect(saveToCloud(bad)).rejects.toThrow("INVALID_PAYLOAD");
    expect(await redis!.get(stateKey)).toBeNull();
  });

  it("PAYLOAD_TOO_LARGE rejects oversized snapshots before parsing", async () => {
    const bloated = {
      ...validSnapshot(),
      recentTasks: [new Array(300_000).fill("x").join("")],
    };
    await expect(saveToCloud(bloated)).rejects.toThrow("PAYLOAD_TOO_LARGE");
    expect(await redis!.get(stateKey)).toBeNull();
  });

  it("round-trip: saveToCloud writes; loadFromCloud reads back the same shape", async () => {
    const snap = validSnapshot();
    snap.ftoken = 7;
    snap.recentTasks = ["刷题", "写笔记"];

    const before = Date.now();
    const saveRes = await saveToCloud(snap);
    expect(saveRes.ok).toBe(true);
    expect(saveRes.savedAt).toBeGreaterThanOrEqual(before);

    const loaded = await loadFromCloud();
    expect(loaded).not.toBeNull();
    expect(loaded!.savedAt).toBe(saveRes.savedAt);
    expect((loaded!.snapshot as { ftoken: number }).ftoken).toBe(7);
    expect((loaded!.snapshot as { recentTasks: string[] }).recentTasks).toEqual([
      "刷题",
      "写笔记",
    ]);
  });

  it("loadFromCloud returns null when no snapshot has been saved", async () => {
    const loaded = await loadFromCloud();
    expect(loaded).toBeNull();
  });

  it("RATE_LIMITED kicks in after the per-window cap; the offending write is rejected", async () => {
    // Pre-seed the rate-limit bucket past the 30-cap so the next save trips it.
    const bucket = Math.floor(Date.now() / 1000 / 60);
    const rlKey = `tokmato:user:${TEST_USER_ID}:sync-rl:${bucket}`;
    await redis!.set(rlKey, 100, { ex: 65 });

    await expect(saveToCloud(validSnapshot())).rejects.toThrow("RATE_LIMITED");
    // No state written despite the rate limit being client-input-independent.
    expect(await redis!.get(stateKey)).toBeNull();
  });
});
