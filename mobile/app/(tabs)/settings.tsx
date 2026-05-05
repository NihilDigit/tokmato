/**
 * Phase 2 settings — minimal sign-in / sign-out + sync status.
 * Push toggle (expo-notifications) lands in Phase 4; theme picker and
 * full settings UI lands in Phase 5.
 */

import { useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@tokmato/shared/store";
import { signInWithGithub, signOut } from "../../lib/auth";
import { getStoredJwt } from "../../lib/rpc-client";
import { rpc } from "../../lib/rpc-client";
import { selectSnapshot } from "@tokmato/shared/store";
import { useThemeColors } from "../../lib/use-theme";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getStoredJwt().then((jwt) => setSignedIn(Boolean(jwt)));
  }, []);

  async function onSignIn() {
    setBusy(true);
    const out = await signInWithGithub();
    setBusy(false);
    if (!out.ok) {
      if (out.reason !== "cancelled") {
        Alert.alert("登录失败", out.reason);
      }
      return;
    }
    setSignedIn(true);
  }

  async function onSignOut() {
    await signOut();
    setSignedIn(false);
  }

  async function onForceSave() {
    setBusy(true);
    try {
      const out = await rpc.saveCloud(selectSnapshot(useStore.getState()));
      useStore.getState().markSynced(out.savedAt);
      Alert.alert("已推送", new Date(out.savedAt).toLocaleString());
    } catch (err) {
      Alert.alert("推送失败", String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.paper,
        paddingTop: insets.top + 24,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          color: colors.ink3,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        Settings
      </Text>

      <View style={{ marginTop: 32, gap: 16 }}>
        <Row
          label="云同步"
          value={
            lastSavedAt
              ? `上次 ${new Date(lastSavedAt).toLocaleString()}`
              : "未同步"
          }
        />
        <Row label="登录" value={signedIn === null ? "…" : signedIn ? "已登录" : "未登录"} />
      </View>

      <View style={{ marginTop: 32, gap: 12 }}>
        {signedIn ? (
          <>
            <Action label="立即推送" onPress={onForceSave} disabled={busy} />
            <Action label="登出" onPress={onSignOut} disabled={busy} muted />
          </>
        ) : (
          <Action label="使用 GitHub 登录" onPress={onSignIn} disabled={busy} />
        )}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.ink3, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
  muted,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: muted ? colors.rule : colors.ink,
        borderRadius: 10,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: muted ? colors.ink3 : colors.ink,
          fontSize: 15,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
