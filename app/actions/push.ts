"use server";

/**
 * Server actions for Web Push subscription + scheduling.
 *
 * Lifecycle:
 *   savePushSubscription(sub)     — client posts its PushSubscription
 *   removePushSubscription()      — user toggles off
 *   startPushChain({ sessionId,
 *                    boundaryAt,
 *                    kind,
 *                    count })     — fires when a session begins or
 *                                    after a manual phase advance.
 *                                    Invalidates any prior chain by
 *                                    rotating `active-session`.
 *   cancelPushChain()             — endSession; future chain links
 *                                    no-op when they see the mismatch.
 *
 * The chain itself self-perpetuates inside `/api/push/fire` — each
 * delivered notification schedules the next boundary, so the client
 * doesn't need to be open at every transition.
 */

import { auth } from "@/auth";
import { requireRedis, kvKey } from "@/lib/kv";
import {
  isQStashConfigured,
  publishWithDelay,
  cancelMessage,
} from "@/lib/qstash";
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
  kind: z.enum(["running-end", "buffer-end"]),
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

function callbackUrl(): string {
  // QStash needs a public URL it can POST to. Trust VERCEL_URL in
  // preview/prod; allow override for local tunneling (e.g., ngrok).
  const explicit = process.env.QSTASH_CALLBACK_URL;
  if (explicit) return `${explicit.replace(/\/$/, "")}/api/push/fire`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/push/fire`;
  if (process.env.AUTH_URL) return `${process.env.AUTH_URL.replace(/\/$/, "")}/api/push/fire`;
  return "https://tokmato.nihildigit.dev/api/push/fire";
}

export async function savePushSubscription(
  raw: unknown
): Promise<{ ok: true }> {
  const userId = await getUserId();
  const parsed = pushSubscriptionSchema.safeParse(raw);
  if (!parsed.success) throw new PushError("INVALID_PAYLOAD");
  const redis = requireRedis();
  await redis.set(kvKey.pushSubscription(userId), parsed.data);
  return { ok: true };
}

export async function removePushSubscription(): Promise<{ ok: true }> {
  const userId = await getUserId();
  const redis = requireRedis();
  await redis.del(kvKey.pushSubscription(userId));
  // Also tear down any active chain — no point firing notifications
  // to an endpoint we just dropped.
  await redis.del(kvKey.pushPending(userId));
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
  const sub = await redis.get(kvKey.pushSubscription(userId));
  if (!sub) {
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
    callbackUrl: callbackUrl(),
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
