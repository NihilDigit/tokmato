// Native FCM dispatch — used to deliver push notifications to the
// Capacitor Android app at `priority: "high"`, which bypasses Doze on
// locked screens. Web Push (`lib/web-push.ts`) is the parallel
// transport for users on browsers and PWAs; both fan out from
// `/api/push/fire`.
//
// Configuration: a Firebase service-account JSON, base64-encoded into
// the `FIREBASE_SERVICE_ACCOUNT_JSON_B64` env var. Plain JSON in
// `FIREBASE_SERVICE_ACCOUNT_JSON` also works for local dev. Without
// either, this module returns a typed DISABLED result so callers
// degrade gracefully rather than throwing.

import {
  initializeApp,
  cert,
  getApps,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";

const APP_NAME = "tokmato-fcm";

let app: App | null = null;
let initAttempted = false;

function loadServiceAccount(): ServiceAccount | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let json: string | null = null;
  if (b64) {
    try {
      json = Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return null;
    }
  } else if (raw) {
    json = raw;
  }
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  } catch {
    return null;
  }
}

function ensureApp(): App | null {
  if (app) return app;
  if (initAttempted) return null;
  initAttempted = true;
  const sa = loadServiceAccount();
  if (!sa) return null;
  // Reuse a previously-initialized app of the same name to survive
  // module reloads (Next.js HMR, Fluid Compute warm starts).
  const existing = getApps().find((a) => a.name === APP_NAME);
  app = existing ?? initializeApp({ credential: cert(sa) }, APP_NAME);
  return app;
}

export function isFcmConfigured(): boolean {
  return ensureApp() !== null;
}

export type FcmPayload = {
  title: string;
  body: string;
  /** Android notification tag — collapses repeats. */
  tag?: string;
  /** Deep-link target for notification taps. The relay APK reads this
   *  from the `data` block (not `notification.click_action` — that path
   *  needs an Android intent filter and tightens our coupling to the
   *  APK's manifest). Defaults to the home page when unset. */
  url?: string;
};

export type FcmResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "DISABLED" }
  | { ok: false; reason: "EXPIRED"; code: string }
  | { ok: false; reason: "ERROR"; code?: string; message: string };

/**
 * Send a single FCM message at high priority. Caller is responsible
 * for cleanup (HDEL'ing UNREGISTERED tokens from KV).
 *
 * High priority + the `notification` block is what wakes the device
 * out of Doze: a data-only message would be deferred. We pin
 * channel_id to a stable string so all tokmato pushes hit the same
 * Android notification channel.
 */
export async function sendFcmPush(
  token: string,
  payload: FcmPayload
): Promise<FcmResult> {
  const a = ensureApp();
  if (!a) return { ok: false, reason: "DISABLED" };
  const url = payload.url ?? "https://tokmato.nihildigit.dev/home";
  const message: Message = {
    token,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: { url },
    android: {
      priority: "high",
      notification: {
        tag: payload.tag ?? "tokmato",
        channelId: "tokmato-default",
      },
    },
  };
  try {
    const messageId = await getMessaging(a).send(message);
    return { ok: true, messageId };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // Firebase Admin SDK error codes:
    //   messaging/registration-token-not-registered → device unsubscribed
    //   messaging/invalid-registration-token       → never valid; drop
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token" ||
      err.code === "messaging/invalid-argument"
    ) {
      return { ok: false, reason: "EXPIRED", code: err.code };
    }
    return {
      ok: false,
      reason: "ERROR",
      code: err.code,
      message: err.message ?? "unknown",
    };
  }
}
