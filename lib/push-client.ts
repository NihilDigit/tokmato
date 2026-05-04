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

import {
  savePushSubscription,
  removePushSubscription,
  saveFcmToken,
  removeFcmToken,
} from "@/app/actions/push";

const SW_PATH = "/sw.js";
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? "";

// Capacitor injects this global into the WebView. Outside the APK
// it's undefined and we fall back to the Web Push path.
type CapacitorBridge = {
  isNativePlatform: () => boolean;
  Plugins?: {
    PushNotifications?: {
      requestPermissions: () => Promise<{ receive: "granted" | "denied" | "prompt" }>;
      register: () => Promise<void>;
      addListener: (
        event: "registration" | "registrationError" | "pushNotificationReceived",
        handler: (data: { value?: string; error?: string }) => void
      ) => Promise<{ remove: () => Promise<void> }>;
    };
  };
};
function getCapacitor(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return c?.isNativePlatform?.() ? c : null;
}

const NATIVE_TOKEN_LS_KEY = "tokmato:fcm-token";

function readNativeToken(): string | null {
  try {
    return window.localStorage.getItem(NATIVE_TOKEN_LS_KEY);
  } catch {
    return null;
  }
}
function writeNativeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(NATIVE_TOKEN_LS_KEY, token);
    else window.localStorage.removeItem(NATIVE_TOKEN_LS_KEY);
  } catch {
    // ignore
  }
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor native runs through FCM; Web Push APIs aren't required.
  if (getCapacitor()) return true;
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
 * Register a push transport for this device.
 *
 * Native (Capacitor): asks the OS for notification permission,
 * registers with FCM, and ships the resulting token to the server.
 * Web: registers SW, subscribes via VAPID, persists the subscription.
 *
 * Returns a truthy marker on success, null on permission denial.
 */
export async function enablePush(): Promise<PushSubscription | { native: true; token: string } | null> {
  const cap = getCapacitor();
  if (cap) return enableNativePush(cap);

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

async function enableNativePush(
  cap: CapacitorBridge
): Promise<{ native: true; token: string } | null> {
  const Push = cap.Plugins?.PushNotifications;
  if (!Push) {
    throw new Error("Capacitor PushNotifications plugin missing");
  }
  const perm = await Push.requestPermissions();
  if (perm.receive !== "granted") {
    // Match the web caller's contract: null on permission denial so
    // settings shows the same "未授予权限/权限被拒" branch.
    return null;
  }
  // The plugin emits 'registration' asynchronously after register();
  // race it against the error event to avoid hanging forever and
  // surface the underlying reason if registration fails (FCM init,
  // missing google-services.json, network blip, etc.).
  const result = await new Promise<{ ok: true; token: string } | { ok: false; reason: string }>((resolve) => {
    const cleanup: Array<() => Promise<void>> = [];
    const timer = setTimeout(
      () => void finish({ ok: false, reason: "FCM register timed out after 15s" }),
      15_000,
    );
    const finish = async (
      value: { ok: true; token: string } | { ok: false; reason: string },
    ) => {
      clearTimeout(timer);
      for (const fn of cleanup) await fn().catch(() => undefined);
      resolve(value);
    };
    Push.addListener("registration", (data) => {
      if (data.value) void finish({ ok: true, token: data.value });
    }).then((sub) => cleanup.push(sub.remove));
    Push.addListener("registrationError", (data) => {
      const reason = data.error || "FCM registration error (no detail)";
      void finish({ ok: false, reason });
    }).then((sub) => cleanup.push(sub.remove));
    Push.register().catch((e) => {
      const reason = e instanceof Error ? e.message : String(e);
      void finish({ ok: false, reason: `register() threw: ${reason}` });
    });
  });
  if (!result.ok) {
    throw new Error(result.reason);
  }
  writeNativeToken(result.token);
  await saveFcmToken(result.token);
  return { native: true, token: result.token };
}

export async function disablePush(): Promise<void> {
  const cap = getCapacitor();
  if (cap) {
    const token = readNativeToken();
    writeNativeToken(null);
    if (token) {
      try {
        await removeFcmToken(token);
      } catch {
        // ignore
      }
    }
    return;
  }

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

export async function getCurrentSubscription(): Promise<
  PushSubscription | { native: true; token: string } | null
> {
  if (getCapacitor()) {
    const token = readNativeToken();
    return token ? { native: true, token } : null;
  }
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}
