/**
 * Journey — chronological ledger backed by FlashList for 60fps scroll
 * on long histories. Phase 3 surfaces the kind / token deltas / date
 * for each entry; the F·H trend chart is deferred to a later iteration.
 */

import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useStore } from "@tokmato/shared/store";
import type { TokenLedgerEntry } from "@tokmato/shared/types";
import { PageShell } from "../../components/PageShell";
import { EditorialText } from "../../components/EditorialText";
import { useTheme } from "../../lib/use-theme";

const KIND_LABEL: Record<TokenLedgerEntry["kind"], string> = {
  welcome: "迎新",
  pomodoro: "番茄",
  settle: "结算",
  recharge: "充能",
  food: "进食",
  wish: "兑换",
  play: "娱乐",
  rollup: "汇总",
};

export default function Journey() {
  const theme = useTheme();
  const tokenHistory = useStore((s) => s.tokenHistory);

  return (
    <PageShell>
      <View style={{ gap: 24, flex: 1 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            JOURNEY · 30 天
          </EditorialText>
          <EditorialText
            weight="serif"
            size={32}
            color={theme.color.ink}
            style={{ marginTop: 8 }}
          >
            账本
          </EditorialText>
        </View>
        <View style={{ flex: 1, minHeight: 300 }}>
          <FlashList
            data={tokenHistory}
            estimatedItemSize={64}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: 1,
                  backgroundColor: theme.color.rule2,
                  marginVertical: 12,
                }}
              />
            )}
            renderItem={({ item }) => <LedgerRow entry={item} />}
            ListEmptyComponent={
              <EditorialText weight="sans" size={13} color={theme.color.ink3}>
                还没有记录。完成第一个番茄就会在这里出现。
              </EditorialText>
            }
          />
        </View>
      </View>
    </PageShell>
  );
}

function LedgerRow({ entry }: { entry: TokenLedgerEntry }) {
  const theme = useTheme();
  const date = new Date(entry.createdAt);
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <EditorialText weight="sans" size={11} color={theme.color.ink3}>
          {dateLabel} · {KIND_LABEL[entry.kind]}
        </EditorialText>
        {entry.note ? (
          <EditorialText weight="kaiti" size={14} color={theme.color.ink2}>
            {entry.note}
          </EditorialText>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        {entry.fDelta !== 0 ? (
          <EditorialText
            weight="serif"
            size={16}
            color={entry.fDelta > 0 ? theme.color.tomato : theme.color.ink3}
          >
            {entry.fDelta > 0 ? "+" : ""}
            {entry.fDelta} F
          </EditorialText>
        ) : null}
        {entry.hDelta !== 0 ? (
          <EditorialText
            weight="serif"
            size={16}
            color={entry.hDelta > 0 ? theme.color.sage : theme.color.ink3}
          >
            {entry.hDelta > 0 ? "+" : ""}
            {entry.hDelta} H
          </EditorialText>
        ) : null}
        {entry.minutesDelta ? (
          <EditorialText weight="sans" size={12} color={theme.color.tealDeep}>
            {entry.minutesDelta > 0 ? "+" : ""}
            {entry.minutesDelta} min
          </EditorialText>
        ) : null}
      </View>
    </View>
  );
}
