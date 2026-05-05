/**
 * Modal sign-in — alternative entry to Settings's "使用 GitHub 登录"
 * button. Surfaces the same flow as `lib/auth.signInWithGithub` and
 * pops the modal on success.
 */

import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { signInWithGithub } from "../lib/auth";
import { useThemeColors } from "../lib/use-theme";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    const out = await signInWithGithub();
    setBusy(false);
    if (!out.ok) {
      if (out.reason !== "cancelled") Alert.alert("登录失败", out.reason);
      return;
    }
    router.back();
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.paper,
        paddingTop: insets.top + 32,
        paddingHorizontal: 24,
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
        登录
      </Text>
      <Text
        style={{ fontSize: 28, color: colors.ink, marginTop: 16, fontWeight: "300" }}
      >
        云同步需要 GitHub 账号
      </Text>
      <Text style={{ fontSize: 14, color: colors.ink3, marginTop: 12, lineHeight: 22 }}>
        点击下方按钮跳转 GitHub 授权页。授权完成后回到本页，
        本设备会自动从云端拉取你已有的 token / 看板 / 心愿
        清单等数据。
      </Text>

      <Pressable
        onPress={onSignIn}
        disabled={busy}
        style={{
          marginTop: 32,
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderWidth: 1,
          borderColor: colors.ink,
          borderRadius: 10,
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.ink, fontSize: 15, textAlign: "center" }}>
          使用 GitHub 登录
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{ marginTop: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: colors.ink3, fontSize: 14, textAlign: "center" }}>
          稍后再说
        </Text>
      </Pressable>
    </View>
  );
}
