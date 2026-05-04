"use server";

/**
 * Server actions for Web Push subscription + scheduling.
 *
 * Each user can have multiple devices subscribed concurrently — subs
 * live in a Redis Hash keyed by sha1(endpoint), so registering a
 * second device no longer evicts the first. /api/push/fire fans out
 * to every surviving sub on each delivery and prunes 410-expired ones.
 *
 * Lifecycle:
 *   savePushSubscription(sub)        — register THIS device
 *   removePushSubscription(endpoint?) — drop one device by endpoint;
 *                                      no arg = drop all devices for
 *                                      this user (panic teardown)
 *   startPushChain({ sessionId, ... }) — fires at session start or
 *                                      after manual phase advance.
 *                                      Rotating sessionId invalidates
 *                                      any in-flight chain.
 *   cancelPushChain()                — endSession; future chain links
 *                                      no-op on sessionId mismatch.
 *
 * The chain itself self-perpetuates inside `/api/push/fire` — each
 * delivered notification schedules the next boundary, so the client
 * doesn't need to be open at every transition.
 */

import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { requireRedis, kvKey } from "@/lib/kv";
import {
  isQStashConfigured,
  publishWithDelay,
  cancelMessage,
} from "@/lib/qstash";
import { pushCallbackUrl } from "@/lib/push-callback-url";
import { z } from "zod";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2_000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().max(500),
    auth: z.string().max(500),
  }),
});

const startChainSchema = z.object({
  sessionId: z.string().min(1).max(100),
  /** Wall-clock ms when the next notification should fire. */
  boundaryAt: z.number().int().positive(),
  /** "running-end" / "buffer-end" chain across phases for pomodoro;
   *  "play-end" is single-fire — the route handler does not chain
   *  another link after delivering it. */
  kind: z.enum(["running-end", "buffer-end", "play-end"]),
  count: z.number().int().min(1).max(1000),
});

class PushError extends Error {
  readonly code:
    | "UNAUTHENTICATED"
    | "INVALID_PAYLOAD"
    | "PUSH_DISABLED"
    | "NO_SUBSCRIPTION";
  constructor(code: PushError["code"]) {
    super(code);
    this.code = code;
    this.name = "PushError";
  }
}

async function getUserId(): Promise<string> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new PushError("UNAUTHENTICATED");
  return id;
}

/** Stable, short field name for a subscription within the Hash. We
 *  truncate to 16 hex chars — enough to make collisions vanishingly
 *  unlikely in a per-user namespace and short enough to keep dashboards
 *  readable. The full endpoint lives in the Hash value. */
function endpointField(endpoint: string): string {
  return createHash("sha1").update(endpoint).digest("hex").slice(0, 16);
}

const oldSingleSubKey = (userId: string) => `tokmato:user:${userId}:push:sub`;

export async function savePushSubscription(
  raw: unknown
): Promise<{ ok: true }> {
  const userId = await getUserId();
  const parsed = pushSubscriptionSchema.safeParse(raw);
  if (!parsed.success) throw new PushError("INVALID_PAYLOAD");
  const redis = requireRedis();
  await redis.hset(kvKey.pushSubscriptions(userId), {
    [endpointField(parsed.data.endpoint)]: parsed.data,
  });
  // One-shot migration: opportunistically drop the v2.2.x single-sub
  // key the first time a device re-subscribes under the new layout.
  // Cheap to retry; harmless when already absent.
  await redis.del(oldSingleSubKey(userId));
  return { ok: true };
}

const removeArgSchema = z
  .union([z.string().url().max(2_000), z.undefined()])
  .optional();

/**
 * Drop a subscription. Pass the endpoint to drop only that device;
 * pass nothing to drop every device for this user.
 *
 * The "drop all" mode also tears down the active chain — there's
 * nothing to deliver to, so QStash credits would be wasted. Single-
 * device removal leaves the chain alive: the user's other devices
 * still want their boundary alerts.
 */
export async function removePushSubscription(
  endpoint?: string
): Promise<{ ok: true }> {
  const userId = await getUserId();
  const parsed = removeArgSchema.safeParse(endpoint);
  if (!parsed.success) throw new PushError("INVALID_PAYLOAD");
  const redis = requireRedis();
  if (parsed.data) {
    await redis.hdel(kvKey.pushSubscriptions(userId), endpointField(parsed.data));
    return { ok: true };
  }
  await redis.del(kvKey.pushSubscriptions(userId));
  await redis.del(kvKey.pushPending(userId));
  // Migration: also nuke the legacy single-sub key on a panic teardown.
  await redis.del(oldSingleSubKey(userId));
  return { ok: true };
}

/**
 * Begin (or replace) the push chain for the active pomodoro session.
 *
 * Idempotency model: rotating `pushPending.sessionId` invalidates the
 * prior chain — any in-flight QStash callback that sees a sessionId
 * mismatch in `/api/push/fire` will exit without delivering.
 */
export async function startPushChain(
  args: z.infer<typeof startChainSchema>
): Promise<{ ok: true; scheduled: boolean }> {
  const userId = await getUserId();
  const parsed = startChainSchema.safeParse(args);
  if (!parsed.success) throw new PushError("INVALID_PAYLOAD");
  if (!isQStashConfigured()) {
    // Push is best-effort — return ok=true with scheduled=false so the
    // client doesn't surface this as an error in normal use.
    return { ok: true, scheduled: false };
  }

  const redis = requireRedis();
  const subCount = await redis.hlen(kvKey.pushSubscriptions(userId));
  if (subCount === 0) {
    // User hasn't subscribed yet — no-op.
    return { ok: true, scheduled: false };
  }

  // Best-effort cancel of the prior pending message so we don't burn
  // QStash quota on a stale schedule. The sessionId rotation below is
  // what actually guarantees the old chain dies if cancel fails.
  const prior = await redis.get<{ messageId: string }>(kvKey.pushPending(userId));
  if (prior?.messageId) {
    void cancelMessage(prior.messageId);
  }

  const delaySeconds = Math.max(1, Math.round((parsed.data.boundaryAt - Date.now()) / 1000));
  const { messageId } = await publishWithDelay({
    callbackUrl: pushCallbackUrl(),
    body: {
      userId,
      sessionId: parsed.data.sessionId,
      kind: parsed.data.kind,
      count: parsed.data.count,
    },
    delaySeconds,
  });

  await redis.set(kvKey.pushPending(userId), {
    messageId,
    sessionId: parsed.data.sessionId,
  });
  return { ok: true, scheduled: true };
}

/**
 * Stop firing notifications for the active session. Future chain
 * links will no-op when they see the cleared sessionId.
 */
export async function cancelPushChain(): Promise<{ ok: true }> {
  const userId = await getUserId();
  const redis = requireRedis();
  const prior = await redis.get<{ messageId: string }>(kvKey.pushPending(userId));
  if (prior?.messageId) void cancelMessage(prior.messageId);
  await redis.del(kvKey.pushPending(userId));
  return { ok: true };
}
