"use client";

/**
 * Browser-side helpers for Service Worker registration and Web Push
 * subscription. The flow:
 *
 *   1. Caller checks `isPushSupported()` — bail if browser doesn't
 *      do Notifications + Service Workers + Push (Safari < 16.4 etc).
 *   2. `requestPushPermission()` — prompts the user once. Returns the
 *      resulting `NotificationPermission` ("granted" | "denied" |
 *      "default").
 *   3. `enablePush()` — registers SW, subscribes via VAPID, sends the
 *      subscription to the server. Returns the subscription or null
 *      if permission isn't granted.
 *   4. `disablePush()` — unsubscribes locally and tells the server.
 *
 * All side-effecting calls are guarded for environments where these
 * APIs simply aren't there (SSR, old Safari, in-app browsers).
 */

import { savePushSubscription, removePushSubscription } from "@/app/actions/push";

const SW_PATH = "/sw.js";
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? "";

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  // Reuse an existing registration if any — re-registering with the
  // same scope is a no-op but logs noise to the console.
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH);
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

/**
 * Register the SW (if needed), prompt for permission (if needed),
 * subscribe via PushManager, and persist on the server.
 *
 * Returns the subscription on success, null on permission denial.
 * Throws on misconfiguration (missing VAPID key) so the caller can
 * surface a real error instead of a silent no-op.
 */
export async function enablePush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  if (!VAPID_PUBLIC) throw new Error("VAPID public key is not configured");

  const perm = await requestPushPermission();
  if (perm !== "granted") return null;

  const registration = await ensureRegistration();
  if (!registration) return null;
  // SW may not be active yet on first registration — wait briefly.
  if (registration.installing || registration.waiting) {
    await navigator.serviceWorker.ready;
  }

  // Reuse an existing subscription if it matches our VAPID key; else
  // unsubscribe and re-subscribe so the server has the right keys.
  const existing = await registration.pushManager.getSubscription();
  let subscription = existing;
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  await savePushSubscription(subscription.toJSON());
  return subscription;
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const sub = await registration?.pushManager.getSubscription();
  // Capture the endpoint BEFORE unsubscribe — Chrome zeroes the
  // PushSubscription after unsubscribe so we can no longer identify
  // which row in the multi-device Hash to drop.
  const endpoint = sub?.endpoint;
  if (sub) await sub.unsubscribe();
  // Server side teardown is best-effort — even if it fails the local
  // unsubscribe above means the SW won't deliver further pushes. Pass
  // the endpoint so we drop only THIS device, not every device the
  // user has subscribed elsewhere.
  if (!endpoint) return;
  try {
    await removePushSubscription(endpoint);
  } catch {
    // ignore
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}
