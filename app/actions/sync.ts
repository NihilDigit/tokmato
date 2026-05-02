"use server";

/**
 * Server actions for cross-device state sync via Vercel KV (Upstash Redis).
 * Both `saveToCloud` and `loadFromCloud` require an authenticated session;
 * data is namespaced as `tokmato:user:${session.user.id}:state`.
 *
 * Schema is intentionally permissive: client sends a snapshot of the
 * persisted slice of the Zustand store; server stores it as JSON. No
 * server-side merge — the user explicitly chooses save or load direction.
 */

import { auth } from "@/auth";
import { requireRedis, kvKey } from "@/lib/kv";

type AuthedUser = { id: string };

async function getUser(): Promise<AuthedUser> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    throw new Error("UNAUTHENTICATED");
  }
  return { id: user.id };
}

/** Push the client snapshot up to KV. Returns the timestamp it was saved at. */
export async function saveToCloud(snapshot: unknown): Promise<{ ok: true; savedAt: number }> {
  const user = await getUser();
  const redis = requireRedis();
  const savedAt = Date.now();
  await redis.set(kvKey.userState(user.id), {
    snapshot,
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
