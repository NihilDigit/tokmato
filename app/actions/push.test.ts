/**
 * Smoke tests for push server actions — talks to real Redis + QStash.
 * Auth is the only mocked layer; everything else is the production path.
 *
 * These tests namespace under a fixed `tokmato:user:test-smoke:*` key
 * pattern so they don't collide with real user state. Each test cleans
 * up before and after.
 */

import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const TEST_USER_ID = "test-smoke";

let session: { user?: { id?: string } } | null = { user: { id: TEST_USER_ID } };

mock.module("@/auth", () => ({
  auth: async () => session,
}));

const hasInfra = Boolean(
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
);
const describeIf = hasInfra ? describe : describe.skip;

describeIf("push server actions (real Redis + QStash)", async () => {
  const { savePushSubscription, removePushSubscription, startPushChain, cancelPushChain } =
    await import("./push");
  const { redis } = await import("@/lib/kv");

  const SUBS_KEY = `tokmato:user:${TEST_USER_ID}:push:subs`;
  const LEGACY_SUB_KEY = `tokmato:user:${TEST_USER_ID}:push:sub`;
  const PENDING_KEY = `tokmato:user:${TEST_USER_ID}:push:pending`;

  async function cleanup() {
    if (!redis) return;
    await redis.del(SUBS_KEY);
    await redis.del(LEGACY_SUB_KEY);
    await redis.del(PENDING_KEY);
  }

  beforeEach(async () => {
    session = { user: { id: TEST_USER_ID } };
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("savePushSubscription rejects malformed payloads", async () => {
    await expect(savePushSubscription({})).rejects.toThrow("INVALID_PAYLOAD");
    await expect(savePushSubscription(null)).rejects.toThrow("INVALID_PAYLOAD");
  });

  it("savePushSubscription stores into the Hash and clears the legacy key; targeted remove drops only that endpoint", async () => {
    const subA = {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v1/device-A",
      keys: { p256dh: "BX-fake-A", auth: "auth-A" },
    };
    const subB = {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v1/device-B",
      keys: { p256dh: "BX-fake-B", auth: "auth-B" },
    };
    // Seed a legacy single-key sub to verify the migration sweep.
    await redis!.set(LEGACY_SUB_KEY, { endpoint: "legacy", keys: { p256dh: "x", auth: "y" } });

    await savePushSubscription(subA);
    await savePushSubscription(subB);

    const stored = await redis!.hgetall<Record<string, { endpoint: string }>>(SUBS_KEY);
    expect(stored).not.toBeNull();
    const endpoints = Object.values(stored!).map((s) => s.endpoint).sort();
    expect(endpoints).toEqual([subA.endpoint, subB.endpoint].sort());
    // Legacy key got swept on first save.
    expect(await redis!.get(LEGACY_SUB_KEY)).toBeNull();

    // Targeted remove drops just A.
    await removePushSubscription(subA.endpoint);
    const afterA = await redis!.hgetall<Record<string, { endpoint: string }>>(SUBS_KEY);
    const remaining = Object.values(afterA ?? {}).map((s) => s.endpoint);
    expect(remaining).toEqual([subB.endpoint]);

    // Untargeted remove tears down everything.
    await removePushSubscription();
    expect(await redis!.hgetall(SUBS_KEY)).toBeNull();
  });

  it("startPushChain refuses without an authenticated session", async () => {
    session = null;
    await expect(
      startPushChain({
        sessionId: "s1",
        boundaryAt: Date.now() + 60_000,
        kind: "running-end",
        count: 1,
      })
    ).rejects.toThrow("UNAUTHENTICATED");
  });

  it("startPushChain is a no-op (scheduled=false) when no subscription exists", async () => {
    const res = await startPushChain({
      sessionId: "s1",
      boundaryAt: Date.now() + 60_000,
      kind: "running-end",
      count: 1,
    });
    expect(res.scheduled).toBe(false);
  });

  if (process.env.QSTASH_TOKEN) {
    it("startPushChain publishes to QStash and stores pending; cancelPushChain clears it", async () => {
      // Seed a subscription so startPushChain has something to send to.
      await savePushSubscription({
        endpoint: "https://updates.push.services.mozilla.com/wpush/v1/smoke",
        keys: { p256dh: "BX-smoke", auth: "smoke-auth" },
      });

      const res = await startPushChain({
        sessionId: "smoke-session",
        boundaryAt: Date.now() + 120_000,
        kind: "running-end",
        count: 1,
      });
      expect(res.scheduled).toBe(true);

      const pending = await redis!.get<{ messageId: string; sessionId: string }>(
        PENDING_KEY
      );
      expect(pending).not.toBeNull();
      expect(pending!.sessionId).toBe("smoke-session");
      expect(typeof pending!.messageId).toBe("string");

      await cancelPushChain();
      const after = await redis!.get(PENDING_KEY);
      expect(after).toBeNull();
    }, 15_000);

    it("startPushChain rotates pending.sessionId when called twice — old chain is invalidated", async () => {
      await savePushSubscription({
        endpoint: "https://updates.push.services.mozilla.com/wpush/v1/rotate",
        keys: { p256dh: "BX-rotate", auth: "rotate-auth" },
      });

      // First chain — simulates startSession.
      await startPushChain({
        sessionId: "session-A",
        boundaryAt: Date.now() + 120_000,
        kind: "running-end",
        count: 1,
      });
      const first = await redis!.get<{ messageId: string; sessionId: string }>(
        PENDING_KEY
      );
      expect(first?.sessionId).toBe("session-A");

      // Second chain — simulates manual buffer skip rotating phaseStartedAt.
      await startPushChain({
        sessionId: "session-B",
        boundaryAt: Date.now() + 120_000,
        kind: "running-end",
        count: 2,
      });
      const second = await redis!.get<{ messageId: string; sessionId: string }>(
        PENDING_KEY
      );
      expect(second?.sessionId).toBe("session-B");
      // Different message — the old chain's pending pointer was overwritten,
      // so the in-flight callback (if any) sees a sessionId mismatch and exits.
      expect(second?.messageId).not.toBe(first?.messageId);

      await cancelPushChain();
    }, 20_000);
  }
});
