/**
 * Smoke tests for active-session server actions — talks to real Upstash
 * Redis. Auth is the only mocked layer.
 *
 * Namespaced under `tokmato:user:test-active:*`. Each test cleans up
 * before and after.
 */

import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const TEST_USER_ID = "test-active";

let session: { user?: { id?: string } } | null = { user: { id: TEST_USER_ID } };

mock.module("@/auth", () => ({
  auth: async () => session,
}));

const hasInfra = Boolean(
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
);
const describeIf = hasInfra ? describe : describe.skip;

describeIf("active-session server actions (real Redis)", async () => {
  const { setActiveSession, clearActiveSession, getActiveSession } =
    await import("./active-session");
  const { redis } = await import("@/lib/kv");

  const key = `tokmato:user:${TEST_USER_ID}:active`;

  async function cleanup() {
    if (!redis) return;
    await redis.del(key);
  }

  beforeEach(async () => {
    session = { user: { id: TEST_USER_ID } };
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  function validMarker() {
    return {
      task: "刷题",
      tag: "math" as const,
      type: "input" as const,
      startedAt: 1_700_000_000_000,
      phaseStartedAt: 1_700_000_000_000,
      mode: "running" as const,
      count: 1,
    };
  }

  it("UNAUTHENTICATED short-circuits before touching Redis", async () => {
    session = null;
    await expect(setActiveSession(validMarker())).rejects.toThrow("UNAUTHENTICATED");
    await expect(clearActiveSession()).rejects.toThrow("UNAUTHENTICATED");
    await expect(getActiveSession()).rejects.toThrow("UNAUTHENTICATED");
    expect(await redis!.get(key)).toBeNull();
  });

  it("INVALID_PAYLOAD on a malformed marker, no write", async () => {
    const bad = { ...validMarker(), tag: "history" } as never;
    await expect(setActiveSession(bad)).rejects.toThrow("INVALID_PAYLOAD");
    expect(await redis!.get(key)).toBeNull();
  });

  it("set → get round-trips and stamps updatedAt server-side", async () => {
    const before = Date.now();
    await setActiveSession(validMarker());
    const got = await getActiveSession();
    expect(got).not.toBeNull();
    expect(got!.task).toBe("刷题");
    expect(got!.mode).toBe("running");
    expect(got!.count).toBe(1);
    expect(got!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("getActiveSession returns null when nothing is stored", async () => {
    expect(await getActiveSession()).toBeNull();
  });

  it("clearActiveSession removes the marker", async () => {
    await setActiveSession(validMarker());
    expect(await getActiveSession()).not.toBeNull();
    await clearActiveSession();
    expect(await getActiveSession()).toBeNull();
  });

  it("setActiveSession writes a TTL so a crashed device auto-clears", async () => {
    await setActiveSession(validMarker());
    // ttl returns seconds remaining. Should be positive and well within
    // the 30-min window we set; we don't pin an exact value because
    // network latency adds drift.
    const ttl = await redis!.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30 * 60);
  });

  it("setActiveSession overwrites the marker (manual buffer skip case)", async () => {
    await setActiveSession(validMarker());
    const next = {
      ...validMarker(),
      mode: "running" as const,
      count: 2,
      phaseStartedAt: validMarker().phaseStartedAt + 26 * 60 * 1000,
    };
    await setActiveSession(next);
    const got = await getActiveSession();
    expect(got!.count).toBe(2);
    expect(got!.phaseStartedAt).toBe(next.phaseStartedAt);
  });
});
