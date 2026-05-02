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
} as const;
