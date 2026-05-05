/**
 * Settings — sync state, push toggle, settle entry, configs (tags /
 * bonuses / food presets) management, force push/pull escape hatches.
 *
 * Mirrors web's settings surface but trimmed: no theme picker (RN
 * follows OS via `useColorScheme()`), no welcome guide reset (mobile
 * doesn't run the guide — see `_TODO_phase5b.md`).
 */

import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useStore, selectSnapshot } from "@tokmato/shared/store";
import type {
  BonusConfig,
  TagConfig,
} from "@tokmato/shared/types";
import { signInWithGithub, signOut } from "../../lib/auth";
import { getStoredJwt, rpc } from "../../lib/rpc-client";
import { enablePush, unregisterPush } from "../../lib/push";
import { useTheme } from "../../lib/use-theme";
import { PageShell } from "../../components/PageShell";
import { EditorialText } from "../../components/EditorialText";
import { SettleSheet } from "../../components/sheets/SettleSheet";
import { EditTagSheet } from "../../components/sheets/EditTagSheet";
import { EditBonusSheet } from "../../components/sheets/EditBonusSheet";

export default function Settings() {
  const theme = useTheme();
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const lastSettledDate = useStore((s) => s.lastSettledDate);
  const tags = useStore((s) => s.tags);
  const bonuses = useStore((s) => s.bonuses);
  const foodPresets = useStore((s) => s.foodPresets);
  const removeFoodPreset = useStore((s) => s.removeFoodPreset);
  const applyCloud = useStore((s) => s.applyCloudSnapshot);

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [editTag, setEditTag] = useState<{ open: boolean; tag: TagConfig | null }>({
    open: false,
    tag: null,
  });
  const [editBonus, setEditBonus] = useState<{
    open: boolean;
    bonus: BonusConfig | null;
  }>({ open: false, bonus: null });

  useEffect(() => {
    void getStoredJwt().then((jwt) => setSignedIn(Boolean(jwt)));
  }, []);

  async function onSignIn() {
    setBusy(true);
    const out = await signInWithGithub();
    setBusy(false);
    if (!out.ok) {
      if (out.reason !== "cancelled") Alert.alert("登录失败", out.reason);
      return;
    }
    setSignedIn(true);
  }

  async function onSignOut() {
    await signOut();
    setSignedIn(false);
    setPushEnabled(false);
  }

  async function onTogglePush() {
    setBusy(true);
    try {
      if (pushEnabled) {
        await unregisterPush();
        setPushEnabled(false);
      } else {
        const out = await enablePush();
        if (out.ok) setPushEnabled(true);
        else Alert.alert("无法开启推送", out.reason);
      }
    } finally {
      setBusy(false);
    }
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

  function onForcePull() {
    Alert.alert(
      "立即拉取",
      "用云端数据覆盖本机当前未同步的内容，确定继续？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "覆盖",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const out = await rpc.loadCloud();
              if (out.data) {
                applyCloud(
                  out.data.snapshot as Parameters<typeof applyCloud>[0],
                  out.data.savedAt,
                );
                Alert.alert("已拉取", new Date(out.data.savedAt).toLocaleString());
              } else {
                Alert.alert("云端无数据");
              }
            } catch (err) {
              Alert.alert("拉取失败", String(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <PageShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 28, paddingBottom: 80 }}
      >
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            SETTINGS
          </EditorialText>
          <EditorialText
            weight="serif"
            size={28}
            color={theme.color.ink}
            style={{ marginTop: 4 }}
          >
            设置
          </EditorialText>
        </View>

        <Section title="云同步">
          <Row label="状态" value={signedIn === null ? "…" : signedIn ? "已登录" : "未登录"} />
          <Row
            label="上次推送"
            value={lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "未同步"}
          />
          <Row label="上次结算" value={lastSettledDate ?? "未结算"} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {signedIn ? (
              <>
                <ChipBtn label={busy ? "…" : "立即推送"} onPress={onForceSave} disabled={busy} />
                <ChipBtn label="立即拉取" onPress={onForcePull} disabled={busy} muted />
                <ChipBtn label="登出" onPress={onSignOut} disabled={busy} muted />
              </>
            ) : (
              <ChipBtn label="使用 GitHub 登录" onPress={onSignIn} disabled={busy} />
            )}
          </View>
        </Section>

        {signedIn ? (
          <Section title="推送">
            <Row label="状态" value={pushEnabled ? "已开启" : "未开启"} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <ChipBtn
                label={pushEnabled ? "关闭推送" : "开启推送"}
                onPress={onTogglePush}
                disabled={busy}
                muted={pushEnabled}
              />
            </View>
          </Section>
        ) : null}

        <Section title="日终结算">
          <EditorialText weight="sans" size={12} color={theme.color.ink3}>
            每天结算一次，结算昨日 H · 熬夜，并补充 F · 番茄外产出。
          </EditorialText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <ChipBtn label="开始结算" onPress={() => setSettleOpen(true)} />
          </View>
        </Section>

        <Section
          title="Tags"
          action={
            <ChipBtn
              label="+ 新建"
              onPress={() => setEditTag({ open: true, tag: null })}
            />
          }
        >
          {tags.length === 0 ? (
            <EditorialText weight="sans" size={12} color={theme.color.ink3}>
              还没有 tag。
            </EditorialText>
          ) : (
            <View style={{ gap: 6 }}>
              {tags.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setEditTag({ open: true, tag: t })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: theme.color.paper2,
                  }}
                >
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: theme.color[t.color],
                    }}
                  />
                  <EditorialText weight="kaiti" size={14} color={theme.color.ink} style={{ flex: 1 }}>
                    {t.label}
                  </EditorialText>
                  <EditorialText weight="mono" size={11} color={theme.color.ink3}>
                    编辑
                  </EditorialText>
                </Pressable>
              ))}
            </View>
          )}
        </Section>

        <Section
          title="Bonuses"
          action={
            <ChipBtn
              label="+ 新建"
              onPress={() => setEditBonus({ open: true, bonus: null })}
            />
          }
        >
          {bonuses.length === 0 ? (
            <EditorialText weight="sans" size={12} color={theme.color.ink3}>
              没有 bonus 规则。
            </EditorialText>
          ) : (
            <View style={{ gap: 6 }}>
              {bonuses.map((b) => {
                const tag = tags.find((t) => t.id === b.tagId);
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setEditBonus({ open: true, bonus: b })}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      backgroundColor: theme.color.paper2,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <EditorialText weight="kaiti" size={14} color={theme.color.ink}>
                        {tag?.label ?? b.tagId}
                      </EditorialText>
                      <EditorialText
                        weight="mono"
                        size={11}
                        color={theme.color.ink3}
                        style={{ marginTop: 2 }}
                      >
                        {`${b.threshold}→${b.initialReward}F · 每 +${b.step} → +${b.stepReward}F`}
                      </EditorialText>
                    </View>
                    <EditorialText weight="mono" size={11} color={theme.color.ink3}>
                      编辑
                    </EditorialText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Section>

        <Section title="食物常用项">
          {foodPresets.length === 0 ? (
            <EditorialText weight="sans" size={12} color={theme.color.ink3}>
              还没有常用项。在 Redeem · 吃点好的 中新增。
            </EditorialText>
          ) : (
            <View style={{ gap: 6 }}>
              {foodPresets.map((p) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: theme.color.paper2,
                  }}
                >
                  <EditorialText
                    weight="kaiti"
                    size={14}
                    color={theme.color.ink}
                    style={{ flex: 1 }}
                  >
                    {p.name}
                  </EditorialText>
                  <EditorialText
                    weight="mono"
                    size={12}
                    color={theme.color.ink3}
                    style={{ marginRight: 12 }}
                  >
                    {`¥${p.price}`}
                  </EditorialText>
                  <Pressable
                    onPress={() => removeFoodPreset(p.id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 12,
                    }}
                  >
                    <EditorialText weight="sans" size={11} color={theme.color.plum}>
                      删除
                    </EditorialText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>

      <SettleSheet open={settleOpen} onClose={() => setSettleOpen(false)} />
      <EditTagSheet
        open={editTag.open}
        tag={editTag.tag}
        onClose={() => setEditTag({ open: false, tag: null })}
      />
      <EditBonusSheet
        open={editBonus.open}
        bonus={editBonus.bonus}
        onClose={() => setEditBonus({ open: false, bonus: null })}
      />
    </PageShell>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <EditorialText weight="sans" size={11} color={theme.color.ink3}>
          {title.toUpperCase()}
        </EditorialText>
        {action ?? null}
      </View>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <EditorialText weight="sans" size={13} color={theme.color.ink3}>
        {label}
      </EditorialText>
      <EditorialText weight="mono" size={13} color={theme.color.ink}>
        {value}
      </EditorialText>
    </View>
  );
}

function ChipBtn({
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
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: muted ? theme.color.rule : theme.color.ink,
        backgroundColor: muted ? "transparent" : theme.color.ink,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <EditorialText
        weight="sans"
        size={12}
        color={muted ? theme.color.ink2 : theme.color.paper}
      >
        {label}
      </EditorialText>
    </Pressable>
  );
}
