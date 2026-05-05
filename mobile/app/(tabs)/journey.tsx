/**
 * Journey — chronological ledger backed by FlashList for 60fps scroll
 * on long histories. Filters to the most recent 30 tokmato-days
 * (matching web's window) and inserts day-key separators. Trend chart
 * is deferred — Journey here is the readable list view; web has the
 * F·H trend.
 */

import { useMemo } from "react";
import { View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useStore, todayKey } from "@tokmato/shared/store";
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

type Row =
  | { kind: "header"; dayKey: string }
  | { kind: "entry"; entry: TokenLedgerEntry };

const ONE_DAY_MS = 86_400_000;

export default function Journey() {
  const theme = useTheme();
  const tokenHistory = useStore((s) => s.tokenHistory);

  const rows = useMemo<Row[]>(() => {
    if (tokenHistory.length === 0) return [];
    const todayMs = Date.now();
    const cutoff = todayMs - 30 * ONE_DAY_MS;
    const recent = tokenHistory
      .filter((e) => e.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt);
    const out: Row[] = [];
    let lastKey: string | null = null;
    for (const entry of recent) {
      const key = entry.dayKey;
      if (key !== lastKey) {
        out.push({ kind: "header", dayKey: key });
        lastKey = key;
      }
      out.push({ kind: "entry", entry });
    }
    return out;
  }, [tokenHistory]);

  const tKey = useMemo(() => todayKey(), []);

  const renderItem: ListRenderItem<Row> = ({ item }) =>
    item.kind === "header" ? (
      <DayHeader dayKey={item.dayKey} isToday={item.dayKey === tKey} />
    ) : (
      <LedgerRow entry={item.entry} />
    );

  return (
    <PageShell>
      <View style={{ gap: 16, flex: 1 }}>
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
            data={rows}
            estimatedItemSize={56}
            keyExtractor={(item) =>
              item.kind === "header" ? `h-${item.dayKey}` : `e-${item.entry.id}`
            }
            renderItem={renderItem}
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

function DayHeader({ dayKey, isToday }: { dayKey: string; isToday: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: 10,
        marginTop: 18,
        marginBottom: 8,
      }}
    >
      <EditorialText weight="serif" size={18} color={theme.color.ink}>
        {dayKey}
      </EditorialText>
      {isToday ? (
        <EditorialText weight="sans" size={11} color={theme.color.tomato}>
          今日
        </EditorialText>
      ) : null}
      <View style={{ flex: 1, height: 1, backgroundColor: theme.color.rule2, marginLeft: 4 }} />
    </View>
  );
}

function LedgerRow({ entry }: { entry: TokenLedgerEntry }) {
  const theme = useTheme();
  const date = new Date(entry.createdAt);
  const timeLabel = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingVertical: 8,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <EditorialText weight="mono" size={11} color={theme.color.ink3}>
          {`${timeLabel} · ${KIND_LABEL[entry.kind]}`}
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
            {`${entry.fDelta > 0 ? "+" : ""}${entry.fDelta} F`}
          </EditorialText>
        ) : null}
        {entry.hDelta !== 0 ? (
          <EditorialText
            weight="serif"
            size={16}
            color={entry.hDelta > 0 ? theme.color.sage : theme.color.ink3}
          >
            {`${entry.hDelta > 0 ? "+" : ""}${entry.hDelta} H`}
          </EditorialText>
        ) : null}
        {entry.minutesDelta ? (
          <EditorialText weight="mono" size={12} color={theme.color.tealDeep}>
            {`${entry.minutesDelta > 0 ? "+" : ""}${entry.minutesDelta} min`}
          </EditorialText>
        ) : null}
      </View>
    </View>
  );
}
