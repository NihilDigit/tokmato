/**
 * Modal sign-in — alternative entry to Settings's "使用 GitHub 登录"
 * button. Surfaces the same flow as `lib/auth.signInWithGithub` and
 * pops the modal on success.
 */

import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { signInWithGithub } from "../lib/auth";
import { useTheme } from "../lib/use-theme";
import { EditorialText } from "../components/EditorialText";

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
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
        backgroundColor: theme.color.paper,
        paddingTop: insets.top + 32,
        paddingHorizontal: 24,
        gap: 16,
      }}
    >
      <EditorialText weight="sans" size={11} color={theme.color.ink3}>
        SIGN IN
      </EditorialText>
      <EditorialText weight="serif" size={28} color={theme.color.ink}>
        云同步需要 GitHub 账号
      </EditorialText>
      <EditorialText weight="kaiti" size={14} color={theme.color.ink3} style={{ lineHeight: 22 }}>
        点击下方按钮跳转 GitHub 授权页。授权完成后回到本页，本设备会自动从云端拉取你已有的 token / 看板 / 心愿等数据。
      </EditorialText>

      <Pressable
        onPress={onSignIn}
        disabled={busy}
        style={{
          marginTop: 16,
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderWidth: 1,
          borderColor: theme.color.ink,
          borderRadius: 12,
          opacity: busy ? 0.5 : 1,
        }}
      >
        <EditorialText
          weight="sans"
          size={15}
          color={theme.color.ink}
          style={{ textAlign: "center" }}
        >
          使用 GitHub 登录
        </EditorialText>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{ marginTop: 4, paddingVertical: 12 }}
      >
        <EditorialText
          weight="sans"
          size={13}
          color={theme.color.ink3}
          style={{ textAlign: "center" }}
        >
          稍后再说
        </EditorialText>
      </Pressable>
    </View>
  );
}
