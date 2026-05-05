/**
 * Push registration via expo-notifications.
 *
 * - Android: requests POST_NOTIFICATIONS permission (Android 13+),
 *   sets up a high-priority "tokmato-default" channel matching the
 *   `notification` block emitted by `lib/fcm.ts` so OS displays the
 *   tray notification through Doze on locked screens.
 * - iOS (future): requests alert/sound/badge.
 *
 * Token shape: expo-notifications returns an Expo push token by default
 * (`ExponentPushToken[...]`). To match the existing FCM Hash layout
 * in KV (`tokmato:user:{id}:fcm:tokens`) we pull the *raw* device push
 * token via `getDevicePushTokenAsync()` which returns the FCM
 * registration token on Android — same shape `lib/fcm.ts` already
 * delivers to.
 *
 * Foreground policy: show alert+sound when the app is in foreground.
 * Backgrounded delivery is handled by the OS tray automatically when
 * the FCM payload includes a `notification` block (which `lib/fcm.ts`
 * sends). No client work required there.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { rpc, RpcError } from "./rpc-client";

const ANDROID_CHANNEL_ID = "tokmato-default";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushRegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: "denied" | "no-device" | "unsupported" | "save-failed" };

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "tokmato",
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    showBadge: false,
    sound: undefined,
    lockscreenVisibility:
      Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/**
 * Explicit opt-in entry — requests permission if needed, then mints +
 * registers a token. Called from the Settings "开启推送" button.
 */
export async function enablePush(): Promise<PushRegisterResult> {
  if (!Device.isDevice) return { ok: false, reason: "no-device" };
  if (Platform.OS === "web") return { ok: false, reason: "unsupported" };

  await ensureAndroidChannel();

  const settings = await Notifications.getPermissionsAsync();
  let granted =
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
    granted = req.granted;
  }
  if (!granted) return { ok: false, reason: "denied" };

  return mintAndPostToken();
}

/**
 * Silent refresh — only proceeds if permission is already granted.
 * Called from `_layout.tsx` on app launch so a fresh FCM token (which
 * Android may rotate) gets re-registered without re-prompting the
 * user. Never prompts on its own.
 */
export async function refreshPushToken(): Promise<PushRegisterResult> {
  if (!Device.isDevice) return { ok: false, reason: "no-device" };
  if (Platform.OS === "web") return { ok: false, reason: "unsupported" };
  const settings = await Notifications.getPermissionsAsync();
  const granted =
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) return { ok: false, reason: "denied" };
  await ensureAndroidChannel();
  return mintAndPostToken();
}

async function mintAndPostToken(): Promise<PushRegisterResult> {
  let token: string;
  try {
    const out = await Notifications.getDevicePushTokenAsync();
    token = out.data;
  } catch {
    return { ok: false, reason: "save-failed" };
  }
  try {
    await rpc.saveFcmToken(token);
  } catch (err) {
    if (err instanceof RpcError && err.code === "UNAUTHENTICATED") {
      return { ok: false, reason: "save-failed" };
    }
    return { ok: false, reason: "save-failed" };
  }
  return { ok: true, token };
}

export async function unregisterPush(): Promise<void> {
  try {
    const out = await Notifications.getDevicePushTokenAsync();
    await rpc.removeFcmToken(out.data).catch(() => {});
  } catch {
    // No token yet — nothing to remove.
  }
}

/** Subscribe to foreground notification taps. Returns a teardown. */
export function onNotificationTap(handler: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}
