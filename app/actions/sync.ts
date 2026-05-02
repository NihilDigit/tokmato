"use server";

/**
 * Server actions for cross-device state sync via Vercel KV (Upstash Redis).
 *
 * Trust boundary — the snapshot is authenticated client input. Before it
 * lands in Redis we:
 *   1. Verify a signed-in session and namespace by `session.user.id`.
 *   2. Cap raw byte size (`MAX_SNAPSHOT_BYTES`) before parsing, so a
 *      malformed/oversized payload short-circuits without burning Zod
 *      cycles.
 *   3. Validate against `persistedSnapshotSchema` (strict — extra keys
 *      rejected, all caps enforced).
 *   4. Per-user rate limit (sliding-ish 60s window via Redis INCR/EXPIRE)
 *      so a stuck client can't burn KV credits.
 *
 * Errors are surfaced as a small set of stable codes. Internal messages
 * (Zod issues, Redis errors) stay server-side.
 */

import { auth } from "@/auth";
import { requireRedis, kvKey } from "@/lib/kv";
import {
  MAX_SNAPSHOT_BYTES,
  persistedSnapshotSchema,
} from "@/lib/snapshot-schema";

const SAVE_RATE_WINDOW_SEC = 60;
const SAVE_RATE_LIMIT = 30; // ≈ one save every 2s sustained

class SyncError extends Error {
  readonly code:
    | "UNAUTHENTICATED"
    | "PAYLOAD_TOO_LARGE"
    | "INVALID_PAYLOAD"
    | "RATE_LIMITED";
  constructor(code: SyncError["code"], message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "SyncError";
  }
}

type AuthedUser = { id: string };

async function getUser(): Promise<AuthedUser> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    throw new SyncError("UNAUTHENTICATED");
  }
  return { id: user.id };
}

async function checkRateLimit(userId: string): Promise<void> {
  const redis = requireRedis();
  const bucket = Math.floor(Date.now() / 1000 / SAVE_RATE_WINDOW_SEC);
  const key = `tokmato:user:${userId}:sync-rl:${bucket}`;
  // INCR, then EXPIRE on first hit. Cheap two-call pattern; good enough
  // for a single-user app and avoids a Lua script roundtrip.
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, SAVE_RATE_WINDOW_SEC + 5);
  }
  if (count > SAVE_RATE_LIMIT) {
    throw new SyncError("RATE_LIMITED");
  }
}

/** Push the client snapshot up to KV. Returns the timestamp it was saved at. */
export async function saveToCloud(
  snapshot: unknown
): Promise<{ ok: true; savedAt: number }> {
  const user = await getUser();

  // Cap raw size BEFORE parsing — protects the validator from
  // adversarial inputs that are cheap to construct but expensive to
  // walk. JSON.stringify is O(n) and refuses cycles.
  let serialized: string;
  try {
    serialized = JSON.stringify(snapshot);
  } catch {
    throw new SyncError("INVALID_PAYLOAD", "snapshot is not serializable");
  }
  if (!serialized || serialized.length > MAX_SNAPSHOT_BYTES) {
    throw new SyncError("PAYLOAD_TOO_LARGE");
  }

  const parsed = persistedSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    // Don't leak Zod paths to the client — the user can't fix them
    // without devtools, and the detail benefits an attacker more than
    // a legitimate user.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[sync] snapshot validation failed", parsed.error.issues.slice(0, 5));
    }
    throw new SyncError("INVALID_PAYLOAD");
  }

  await checkRateLimit(user.id);

  const redis = requireRedis();
  const savedAt = Date.now();
  await redis.set(kvKey.userState(user.id), {
    snapshot: parsed.data,
    savedAt,
  });
  return { ok: true, savedAt };
}

/** Pull the latest snapshot from KV. Returns null if nothing has been saved yet. */
export async function loadFromCloud(): Promise<{
  snapshot: unknown;
  savedAt: number;
} | null> {
  const user = await getUser();
  const redis = requireRedis();
  const data = await redis.get<{ snapshot: unknown; savedAt: number }>(
    kvKey.userState(user.id)
  );
  return data ?? null;
}
