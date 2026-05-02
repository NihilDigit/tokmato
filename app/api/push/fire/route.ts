/**
 * POST /api/push/fire — QStash callback that delivers a single Web
 * Push notification and chains the next phase boundary.
 *
 * Trust: only QStash calls this. We verify the inbound request via
 * `Upstash-Signature` against our signing keys. Anything that fails
 * verification is rejected with 401 — never fall back to "ok" silently.
 *
 * Chain semantics: each callback delivers one notification and (unless
 * the session has been cancelled) schedules the next boundary. The
 * "session cancelled" check compares the sessionId in the payload
 * against `push:pending` in KV; a mismatch means the user ended the
 * session or restarted it, so we exit without delivering.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRedis, kvKey } from "@/lib/kv";
import { sendWebPush, type PushSubscription } from "@/lib/web-push";
import {
  isQStashConfigured,
  publishWithDelay,
  verifyQStashSignature,
} from "@/lib/qstash";

const POMO_MS = 25 * 60 * 1000;
const BUFFER_MS = 60 * 1000;

const callbackBodySchema = z.object({
  userId: z.string().min(1).max(100),
  sessionId: z.string().min(1).max(100),
  kind: z.enum(["running-end", "buffer-end"]),
  count: z.number().int().min(1).max(1000),
});

function callbackUrl(): string {
  const explicit = process.env.QSTASH_CALLBACK_URL;
  if (explicit) return `${explicit.replace(/\/$/, "")}/api/push/fire`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/push/fire`;
  if (process.env.AUTH_URL) return `${process.env.AUTH_URL.replace(/\/$/, "")}/api/push/fire`;
  return "https://tokmato.nihildigit.dev/api/push/fire";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature");

  // Verify signature against QStash's signing keys. Without this any
  // public actor could trigger arbitrary push deliveries.
  const verified = await verifyQStashSignature(signature, rawBody, callbackUrl());
  if (!verified) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }
  const parsed = callbackBodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return new NextResponse("invalid payload", { status: 400 });
  }
  const { userId, sessionId, kind, count } = parsed.data;

  const redis = requireRedis();

  // Cancellation check — if the client has called cancelPushChain, or
  // started a new session, push:pending will not match this sessionId.
  const pending = await redis.get<{ messageId: string; sessionId: string }>(
    kvKey.pushPending(userId)
  );
  if (!pending || pending.sessionId !== sessionId) {
    return NextResponse.json({ ok: true, skipped: "stale-session" });
  }

  const subscription = await redis.get<PushSubscription>(
    kvKey.pushSubscription(userId)
  );
  if (!subscription) {
    return NextResponse.json({ ok: true, skipped: "no-subscription" });
  }

  // Deliver the notification for this boundary.
  const payload =
    kind === "running-end"
      ? {
          title: "番茄完成",
          body: `第 ${count} 个番茄结束 · 进入 1 分钟缓冲`,
          tag: "tokmato-pomodoro",
        }
      : {
          title: "缓冲结束",
          body: `第 ${count + 1} 个番茄开始`,
          tag: "tokmato-pomodoro",
        };
  const result = await sendWebPush(subscription, payload);

  // Subscription expired — drop it so we stop scheduling.
  if (!result.ok && result.reason === "EXPIRED") {
    await redis.del(kvKey.pushSubscription(userId));
    await redis.del(kvKey.pushPending(userId));
    // Marker is still valid — the user might re-subscribe and the
    // session is genuinely live. We let TTL clear it naturally.
    return NextResponse.json({ ok: true, dropped: "expired" });
  }
  // Other errors: log but proceed to schedule next link — a transient
  // delivery failure shouldn't break the chain forever.
  if (!result.ok && process.env.NODE_ENV !== "production") {
    console.warn("[push/fire] delivery failed", result);
  }

  // Advance the cross-device active marker so a closed-tab originator
  // still keeps the marker live and accurate. The stale-session check
  // above has already gated this branch, so we only ever update the
  // marker for the canonical chain.
  await advanceActiveMarker(redis, userId);

  // Schedule the next phase boundary so the chain continues even
  // while the browser is fully closed.
  if (!isQStashConfigured()) {
    return NextResponse.json({ ok: true, chained: false });
  }

  const next =
    kind === "running-end"
      ? { kind: "buffer-end" as const, count, delaySeconds: BUFFER_MS / 1000 }
      : { kind: "running-end" as const, count: count + 1, delaySeconds: POMO_MS / 1000 };

  try {
    const { messageId } = await publishWithDelay({
      callbackUrl: callbackUrl(),
      body: { userId, sessionId, kind: next.kind, count: next.count },
      delaySeconds: next.delaySeconds,
    });
    await redis.set(kvKey.pushPending(userId), {
      messageId,
      sessionId,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[push/fire] chain schedule failed", e);
    }
    // Drop pending so the client knows the chain has stopped.
    await redis.del(kvKey.pushPending(userId));
  }

  return NextResponse.json({ ok: true });
}

const ACTIVE_TTL_SECONDS = 30 * 60;

type ActiveMarker = {
  task: string;
  tag: string;
  type: string;
  startedAt: number;
  phaseStartedAt: number;
  mode: "running" | "buffer";
  count: number;
  updatedAt: number;
};

/** Read the marker, advance one phase, write it back. The advance
 *  rules mirror `advancePomodoroPhase` in the client store: natural
 *  boundary bumps `phaseStartedAt` by the elapsed phase duration,
 *  flips mode, and increments count when going buffer→running.
 *  No-op if the marker doesn't exist (e.g. the user already ended). */
async function advanceActiveMarker(
  redis: ReturnType<typeof requireRedis>,
  userId: string
): Promise<void> {
  const marker = await redis.get<ActiveMarker>(kvKey.activeSession(userId));
  if (!marker) return;
  const isRunning = marker.mode === "running";
  const next: ActiveMarker = {
    ...marker,
    mode: isRunning ? "buffer" : "running",
    phaseStartedAt: marker.phaseStartedAt + (isRunning ? POMO_MS : BUFFER_MS),
    count: isRunning ? marker.count : marker.count + 1,
    updatedAt: Date.now(),
  };
  await redis.set(kvKey.activeSession(userId), next, { ex: ACTIVE_TTL_SECONDS });
}
