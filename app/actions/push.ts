"use server";

/**
 * Server actions for push subscription + scheduling.
 *
 * Two transports run side by side:
 *   - Web Push (browsers and PWAs) — `pushSubscriptions` Hash, sub keyed
 *     by sha1(endpoint).
 *   - Native FCM (the Capacitor Android app) — `fcmTokens` Hash, token
 *     keyed by sha1(token). Native FCM gets priority:high and bypasses
 *     Doze on locked screens; web push cannot.
 *
 * Both Hashes carry many devices per user — registering on a second
 * device no longer evicts the first. /api/push/fire fans out to every
 * surviving entry on each delivery and prunes expired ones.
 *
 * Lifecycle:
 *   savePushSubscription(sub)        — register a Web Push device
 *   removePushSubscription(endpoint?) — drop one or all Web Push devices
 *   saveFcmToken(token)              — register a Capacitor device
 *   removeFcmToken(token?)           — drop one or all FCM tokens
 *   startPushChain({ sessionId, ... }) — fires at session start or after
 *                                      manual phase advance. Rotating
 *                                      sessionId invalidates any
 *                                      in-flight chain.
 *   cancelPushChain(scope?)          — endSession/endPlay; future chain
 *                                      links no-op on sessionId mismatch.
 *
 * The chain itself self-perpetuates inside `/api/push/fire` — each
 * delivered notification schedules the next boundary, so the client
 * doesn't need to be open at every transition.
 */

import { createHash } from "node:crypto";
import { fcmTokenField } from "@/lib/fcm-token-field";
import { requireRedis, kvKey } from "@/lib/kv";
import { requireUserId, RpcAuthError } from "@/lib/rpc-auth";
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

const cancelScopeSchema = z
  .enum(["pomodoro", "play", "all"])
  .optional();

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
  try {
    return await requireUserId();
  } catch (err) {
    if (err instanceof RpcAuthError) throw new PushError("UNAUTHENTICATED");
    throw err;
  }
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
 * The "drop all" mode tears down scheduled callbacks only when no FCM
 * transport remains. Single-device removal leaves callbacks alive: the
 * user's other devices still want their boundary alerts.
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
  if ((await redis.hlen(kvKey.fcmTokens(userId))) === 0) {
    await redis.del(kvKey.pushPending(userId));
    await redis.del(kvKey.playPushPending(userId));
  }
  // Migration: also nuke the legacy single-sub key on a panic teardown.
  await redis.del(oldSingleSubKey(userId));
  return { ok: true };
}

const fcmTokenSchema = z.string().min(40).max(500);


function pendingKeyForKind(
  userId: string,
  kind: z.infer<typeof startChainSchema>["kind"]
): string {
  return kind === "play-end"
    ? kvKey.playPushPending(userId)
    : kvKey.pushPending(userId);
}

/**
 * Save an FCM device token for the current user. Capacitor's native
 * push plugin fires this on app start once it has a fresh token.
 * Multiple devices coexist via the Hash layout — the same user on
 * phone-A and phone-B keeps both tokens registered.
 */
export async function saveFcmToken(token: unknown): Promise<{ ok: true }> {
  const userId = await getUserId();
  const parsed = fcmTokenSchema.safeParse(token);
  if (!parsed.success) throw new PushError("INVALID_PAYLOAD");
  const redis = requireRedis();
  await redis.hset(kvKey.fcmTokens(userId), {
    [fcmTokenField(parsed.data)]: parsed.data,
  });
  return { ok: true };
}

const removeFcmArgSchema = z
  .union([fcmTokenSchema, z.undefined()])
  .optional();

/**
 * Drop an FCM token. Pass the token to drop only that device; pass
 * nothing to drop every FCM device for this user. Symmetric with
 * `removePushSubscription` for the web-push side.
 */
export async function removeFcmToken(token?: string): Promise<{ ok: true }> {
  const userId = await getUserId();
  const parsed = removeFcmArgSchema.safeParse(token);
  if (!parsed.success) throw new PushError("INVALID_PAYLOAD");
  const redis = requireRedis();
  if (parsed.data) {
    await redis.hdel(kvKey.fcmTokens(userId), fcmTokenField(parsed.data));
    return { ok: true };
  }
  await redis.del(kvKey.fcmTokens(userId));
  if ((await redis.hlen(kvKey.pushSubscriptions(userId))) === 0) {
    await redis.del(kvKey.pushPending(userId));
    await redis.del(kvKey.playPushPending(userId));
  }
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
  const [subCount, fcmCount] = await Promise.all([
    redis.hlen(kvKey.pushSubscriptions(userId)),
    redis.hlen(kvKey.fcmTokens(userId)),
  ]);
  if (subCount === 0 && fcmCount === 0) {
    // No registered transports for this user — nothing to schedule.
    return { ok: true, scheduled: false };
  }

  // Best-effort cancel of the prior pending message so we don't burn
  // QStash quota on a stale schedule. The sessionId rotation below is
  // what actually guarantees the old chain dies if cancel fails.
  const pendingKey = pendingKeyForKind(userId, parsed.data.kind);
  const prior = await redis.get<{ messageId: string }>(pendingKey);
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

  await redis.set(pendingKey, {
    messageId,
    sessionId: parsed.data.sessionId,
  });
  return { ok: true, scheduled: true };
}

/**
 * Stop firing notifications for the active session. Future chain
 * links will no-op when they see the cleared sessionId.
 */
export async function cancelPushChain(
  scope?: z.infer<typeof cancelScopeSchema>
): Promise<{ ok: true }> {
  const userId = await getUserId();
  const parsed = cancelScopeSchema.safeParse(scope);
  if (!parsed.success) throw new PushError("INVALID_PAYLOAD");
  const normalized = parsed.data ?? "pomodoro";
  const redis = requireRedis();

  const keys =
    normalized === "all"
      ? [kvKey.pushPending(userId), kvKey.playPushPending(userId)]
      : normalized === "play"
        ? [kvKey.playPushPending(userId)]
        : [kvKey.pushPending(userId)];

  await Promise.all(
    keys.map(async (key) => {
      const prior = await redis.get<{ messageId: string }>(key);
      if (prior?.messageId) void cancelMessage(prior.messageId);
      await redis.del(key);
    })
  );
  return { ok: true };
}
