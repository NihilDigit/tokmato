"use server";

/**
 * Pair-code dance for the tokmato-relay Android helper APK.
 *
 * Why pair-code instead of OAuth-in-native: the relay app has no
 * webview and we'd rather not embed a token-exchange flow there.
 * Pair-code is a 4-digit, 60-second-TTL handshake — short enough that
 * brute force (10 000 codes per 60 s ≤ 167 codes/s sustained, ignoring
 * server-side rate limits) doesn't beat the TTL window for any
 * realistic attacker, and the relay never needs to know the user's
 * GitHub identity.
 *
 * Flow:
 *   1. Web user signed in → `createDevicePairCode()` mints a 4-digit
 *      code, KV `tokmato:pair-code:<code>` = userId, EX 60.
 *   2. User reads the code, types it into the APK.
 *   3. APK calls `redeemDevicePairCode({ code, fcmToken })`. We
 *      delete the code (single-use), write the FCM token to the
 *      user's `kvKey.fcmTokens` Hash, and echo the userId back.
 *   4. APK persists `userId` for token rotation later.
 */

import { auth } from "@/auth";
import { requireRedis, kvKey } from "@/lib/kv";
import { fcmTokenField } from "@/lib/fcm-token-field";

const PAIR_CODE_TTL_SECONDS = 60;

class PairError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "INVALID_PAYLOAD" | "INTERNAL") {
    super(code);
  }
}

function pairCodeKey(code: string): string {
  return `tokmato:pair-code:${code}`;
}

export async function createDevicePairCode(): Promise<{
  ok: true;
  code: string;
  expiresAt: number;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new PairError("UNAUTHENTICATED");
  const userId = session.user.id;
  const redis = requireRedis();

  // Random 4-digit code with NX guard against collision. 5 retries is
  // more than enough at 0.01 % per attempt.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
    const set = await redis.set(pairCodeKey(code), userId, {
      ex: PAIR_CODE_TTL_SECONDS,
      nx: true,
    });
    if (set === "OK") {
      return {
        ok: true,
        code,
        expiresAt: Date.now() + PAIR_CODE_TTL_SECONDS * 1000,
      };
    }
  }
  throw new PairError("INTERNAL");
}

export async function redeemDevicePairCode(input: unknown): Promise<{
  ok: true;
  sub: string;
}> {
  const obj = (input ?? {}) as { code?: unknown; fcmToken?: unknown };
  const code = typeof obj.code === "string" ? obj.code.trim() : "";
  const fcmToken = typeof obj.fcmToken === "string" ? obj.fcmToken.trim() : "";
  if (!/^\d{4}$/.test(code)) throw new PairError("INVALID_PAYLOAD");
  if (fcmToken.length < 40 || fcmToken.length > 500) {
    throw new PairError("INVALID_PAYLOAD");
  }
  const redis = requireRedis();
  const userId = await redis.get<string>(pairCodeKey(code));
  if (!userId) throw new PairError("UNAUTHENTICATED");

  // Single-use: delete the code first so a parallel retry can't double-bind.
  await redis.del(pairCodeKey(code));
  await redis.hset(kvKey.fcmTokens(userId), {
    [fcmTokenField(fcmToken)]: fcmToken,
  });
  return { ok: true, sub: userId };
}
