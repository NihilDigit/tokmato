"use server";

/**
 * Cross-device read-only awareness of an in-progress pomodoro string.
 *
 * Single key per user (`tokmato:user:{id}:active`) with a 30-minute TTL.
 * Writers:
 *   - client `startSession`        → setActiveSession(...)
 *   - client manual buffer skip    → setActiveSession(...) (refresh)
 *   - client `endSession`          → clearActiveSession()
 *   - server `/api/push/fire`      → setActiveSession(...) on phase advance
 *     (keeps the marker live while the originating tab is closed; the
 *      stale-session check in /api/push/fire ensures only the current
 *      chain writes here.)
 *
 * Reader: `useActiveSession` hook polls every 30s while foreground.
 * "Self vs other" is decided by comparing `startedAt` (immutable session
 * identity) against the local store's `session.startedAt`.
 */

import { auth } from "@/auth";
import { requireRedis, kvKey } from "@/lib/kv";
import { z } from "zod";

const ACTIVE_TTL_SECONDS = 30 * 60;

const tagId = z.enum(["cs", "math", "english", "others", "trash"]);
const sessionType = z.enum(["input", "output"]);
const sessionMode = z.enum(["running", "buffer"]);

const activeSessionMarkerSchema = z.object({
  task: z.string().max(500),
  tag: tagId,
  type: sessionType,
  startedAt: z.number().int().min(0),
  phaseStartedAt: z.number().int().min(0),
  mode: sessionMode,
  count: z.number().int().min(1).max(1000),
  updatedAt: z.number().int().min(0),
});

export type ActiveSessionMarker = z.infer<typeof activeSessionMarkerSchema>;

class ActiveSessionError extends Error {
  readonly code: "UNAUTHENTICATED" | "INVALID_PAYLOAD";
  constructor(code: ActiveSessionError["code"]) {
    super(code);
    this.code = code;
    this.name = "ActiveSessionError";
  }
}

async function getUserId(): Promise<string> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new ActiveSessionError("UNAUTHENTICATED");
  return id;
}

export async function setActiveSession(
  raw: Omit<ActiveSessionMarker, "updatedAt">
): Promise<{ ok: true }> {
  const userId = await getUserId();
  const candidate = { ...raw, updatedAt: Date.now() };
  const parsed = activeSessionMarkerSchema.safeParse(candidate);
  if (!parsed.success) throw new ActiveSessionError("INVALID_PAYLOAD");
  const redis = requireRedis();
  await redis.set(kvKey.activeSession(userId), parsed.data, {
    ex: ACTIVE_TTL_SECONDS,
  });
  return { ok: true };
}

export async function clearActiveSession(): Promise<{ ok: true }> {
  const userId = await getUserId();
  const redis = requireRedis();
  await redis.del(kvKey.activeSession(userId));
  return { ok: true };
}

export async function getActiveSession(): Promise<ActiveSessionMarker | null> {
  const userId = await getUserId();
  const redis = requireRedis();
  const data = await redis.get<ActiveSessionMarker>(kvKey.activeSession(userId));
  if (!data) return null;
  // Defensive re-parse — Redis returned an object but the shape could
  // be from an older deploy. Drop on mismatch instead of poisoning UI.
  const parsed = activeSessionMarkerSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
