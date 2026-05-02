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

  async function cleanup() {
    if (!redis) return;
    await redis.del(`tokmato:user:${TEST_USER_ID}:push:sub`);
    await redis.del(`tokmato:user:${TEST_USER_ID}:push:pending`);
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

  it("savePushSubscription stores a valid subscription, removePushSubscription deletes it", async () => {
    const sub = {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v1/test",
      keys: { p256dh: "BX-fake-key", auth: "auth-fake" },
    };
    await savePushSubscription(sub);
    const stored = await redis!.get(`tokmato:user:${TEST_USER_ID}:push:sub`);
    expect(stored).toMatchObject({ endpoint: sub.endpoint });

    await removePushSubscription();
    const after = await redis!.get(`tokmato:user:${TEST_USER_ID}:push:sub`);
    expect(after).toBeNull();
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
        `tokmato:user:${TEST_USER_ID}:push:pending`
      );
      expect(pending).not.toBeNull();
      expect(pending!.sessionId).toBe("smoke-session");
      expect(typeof pending!.messageId).toBe("string");

      await cancelPushChain();
      const after = await redis!.get(`tokmato:user:${TEST_USER_ID}:push:pending`);
      expect(after).toBeNull();
    }, 15_000);
  }
});
