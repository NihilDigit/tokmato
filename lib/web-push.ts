// Web Push delivery — VAPID-signed payloads to the user's push endpoint.
//
// Used only on the server (in QStash callbacks and server actions).
// Reads VAPID keys from env at module load. If keys are missing the
// helper returns a typed "DISABLED" result so callers degrade
// gracefully instead of throwing.

import webpush, { type PushSubscription } from "web-push";

const PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.WEB_PUSH_VAPID_SUBJECT ?? "";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY || !SUBJECT) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export type WebPushPayload = {
  title: string;
  body: string;
  /** Optional notification tag — collapses repeats. */
  tag?: string;
};

export type WebPushResult =
  | { ok: true }
  | { ok: false; reason: "DISABLED" }
  | { ok: false; reason: "EXPIRED"; statusCode: number }
  | { ok: false; reason: "ERROR"; statusCode?: number; message: string };

/**
 * Send a single Web Push payload. Caller is responsible for cleanup
 * (deleting expired subscriptions from KV).
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: WebPushPayload
): Promise<WebPushResult> {
  if (!ensureConfigured()) {
    return { ok: false, reason: "DISABLED" };
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    // 404 = endpoint gone, 410 = subscription expired. Both are terminal
    // and the caller should drop the subscription.
    if (err.statusCode === 404 || err.statusCode === 410) {
      return { ok: false, reason: "EXPIRED", statusCode: err.statusCode };
    }
    return {
      ok: false,
      reason: "ERROR",
      statusCode: err.statusCode,
      message: err.message ?? "unknown",
    };
  }
}

export type { PushSubscription };
