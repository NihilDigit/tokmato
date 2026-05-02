// Upstash QStash wrapper — schedules delayed HTTP delivery to our own
// `/api/push/fire` endpoint. The chain is:
//
//   client startSession
//     → server action `startPushChain`
//     → QStash publish with delay
//     → (delay elapses)
//     → QStash POSTs to /api/push/fire
//     → web-push to user's push endpoint
//     → SW shows notification
//     → /api/push/fire schedules NEXT chain link
//
// We use the SDK's `Client.publishJSON` for scheduling and `Receiver`
// for verifying inbound callbacks.

import { Client, Receiver } from "@upstash/qstash";

const QSTASH_TOKEN = process.env.QSTASH_TOKEN ?? "";
const QSTASH_URL = process.env.QSTASH_URL ?? ""; // optional region override
const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY ?? "";
const QSTASH_NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY ?? "";

export function isQStashConfigured(): boolean {
  return Boolean(QSTASH_TOKEN);
}

let client: Client | null = null;
function getClient(): Client {
  if (!QSTASH_TOKEN) {
    throw new Error("QSTASH_TOKEN is not configured");
  }
  if (!client) {
    client = new Client({
      token: QSTASH_TOKEN,
      ...(QSTASH_URL ? { baseUrl: QSTASH_URL } : {}),
    });
  }
  return client;
}

let receiver: Receiver | null = null;
function getReceiver(): Receiver | null {
  if (!QSTASH_CURRENT_SIGNING_KEY || !QSTASH_NEXT_SIGNING_KEY) return null;
  if (!receiver) {
    receiver = new Receiver({
      currentSigningKey: QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: QSTASH_NEXT_SIGNING_KEY,
    });
  }
  return receiver;
}

/**
 * Verify an inbound QStash callback request. Returns true only if the
 * `Upstash-Signature` header is valid for the given body. Returns false
 * if signing keys are not configured (refuse the request).
 */
export async function verifyQStashSignature(
  signature: string | null,
  body: string,
  url: string
): Promise<boolean> {
  if (!signature) return false;
  const r = getReceiver();
  if (!r) return false;
  try {
    return await r.verify({ signature, body, url });
  } catch {
    return false;
  }
}

/**
 * Schedule a JSON POST to `callbackUrl` after `delaySeconds`.
 * Returns the QStash messageId so the caller can cancel later.
 */
export async function publishWithDelay<T>(args: {
  callbackUrl: string;
  body: T;
  delaySeconds: number;
}): Promise<{ messageId: string }> {
  const c = getClient();
  const res = await c.publishJSON({
    url: args.callbackUrl,
    body: args.body,
    delay: Math.max(1, Math.floor(args.delaySeconds)),
    // Don't retry — a missed boundary alert is better than a stale one
    // arriving 10 minutes late after retries.
    retries: 0,
  });
  return { messageId: res.messageId };
}

/**
 * Cancel a previously-scheduled QStash message. No-op if the message
 * has already fired or the SDK rejects the delete.
 */
export async function cancelMessage(messageId: string): Promise<void> {
  if (!messageId) return;
  try {
    const c = getClient();
    await c.messages.delete(messageId);
  } catch {
    // Already-fired or unknown messageId — both are fine to ignore;
    // the worst case is one extra notification that arrives at the
    // originally-scheduled time.
  }
}
