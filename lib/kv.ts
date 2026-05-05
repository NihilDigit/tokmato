// Upstash Redis client.
// Works with Vercel KV (which uses Upstash under the hood).
// Env vars: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   OR     KV_REST_API_URL + KV_REST_API_TOKEN  (Vercel KV legacy names)

import { Redis } from "@upstash/redis";

function readEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? (fallback ? process.env[fallback] : undefined);
}

const url = readEnv("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL");
const token = readEnv("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN");

if (!url || !token) {
  // Don't throw at import time — server actions / route handlers will surface
  // a clearer "KV not configured" error when they try to read/write.
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[kv] Upstash Redis env vars not set. Server actions will fail until UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_URL/TOKEN) is configured."
    );
  }
}

export const redis = url && token ? new Redis({ url, token }) : null;

export function requireRedis(): Redis {
  if (!redis) {
    throw new Error(
      "KV (Upstash Redis) is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
  }
  return redis;
}

// Key conventions — namespaced by user id (from NextAuth session).
export const kvKey = {
  userState: (userId: string) => `tokmato:user:${userId}:state`,
  pomodoros: (userId: string, dateKey: string) =>
    `tokmato:user:${userId}:pomos:${dateKey}`, // dateKey: YYYY-MM-DD (UTC+8 with 4am cutoff)
  /** Multi-device push subscriptions, kept as a Redis Hash keyed by
   *  the truncated sha1 of `subscription.endpoint`. Replaces the v2.2.x
   *  single-key layout (`push:sub`) — one device used to overwrite the
   *  next, so only the latest-subscribed device received notifications. */
  pushSubscriptions: (userId: string) => `tokmato:user:${userId}:push:subs`,
  /** Native-FCM tokens from the Capacitor Android app, kept as a
   *  Redis Hash keyed by the truncated sha1 of the token. Parallel to
   *  pushSubscriptions but feeds the priority:high path that bypasses
   *  Doze on locked screens. */
  fcmTokens: (userId: string) => `tokmato:user:${userId}:fcm:tokens`,
  /** Currently-pending QStash messageId for the next pomodoro phase boundary. */
  pushPending: (userId: string) => `tokmato:user:${userId}:push:pending`,
  /** Single-fire entertainment-end QStash message. Kept separate from
   *  pomodoro so ending/skipping one timer does not cancel the other. */
  playPushPending: (userId: string) => `tokmato:user:${userId}:push:pending:play`,
  /** Cross-device "another device is running a pomodoro" read-only marker.
   *  Lives with a TTL — auto-clears if the writing device crashes mid-run. */
  activeSession: (userId: string) => `tokmato:user:${userId}:active`,
} as const;
