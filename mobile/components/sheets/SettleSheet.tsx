/**
 * SettleSheet — daily settle (yesterday review + H + overnight).
 *
 * Web port is a 4-step stepper with count-up animation; the RN port
 * collapses to a single scrollable form. Same economics:
 *
 *   F gain = vocab ? 0.5 : 0
 *   H raw  = sum(checks) * 0.5
 *   H gain = max(0, H raw − overnightHours * 2)
 *
 * On confirm calls `settle({ fGained, hGained })`; the store handles
 * the ledger entry and `lastSettledDate` advance. Yesterday's pomodoro
 * F was already credited at endSession time, so this step is purely
 * retrospective for the tomato column.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useStore, yesterdayKey } from "@tokmato/shared/store";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

type HItemId =
  | "exercise"
  | "exerciseLong"
  | "sleep8"
  | "earlyBed"
  | "noSnack"
  | "healthyDiet";

const H_ITEMS: { id: HItemId; label: string }[] = [
  { id: "exercise", label: "进行健身" },
  { id: "exerciseLong", label: "完成 50 分钟健身" },
  { id: "sleep8", label: "睡足 8 小时" },
  { id: "earlyBed", label: "0 点前入睡" },
  { id: "noSnack", label: "未加餐" },
  { id: "healthyDiet", label: "饮食健康" },
];

export function SettleSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const settle = useStore((s) => s.settle);
  const pomodoroHistory = useStore((s) => s.pomodoroHistory);
  const tags = useStore((s) => s.tags);

  const [vocab, setVocab] = useState(false);
  const [hChecks, setHChecks] = useState<Record<HItemId, boolean>>({
    exercise: false,
    exerciseLong: false,
    sleep8: false,
    earlyBed: false,
    noSnack: false,
    healthyDiet: false,
  });
  const [overnightH, setOvernightH] = useState(0);

  useEffect(() => {
    if (!open) return;
    setVocab(false);
    setHChecks({
      exercise: false,
      exerciseLong: false,
      sleep8: false,
      earlyBed: false,
      noSnack: false,
      healthyDiet: false,
    });
    setOvernightH(0);
  }, [open]);

  const yKey = useMemo(() => yesterdayKey(), [open]);
  const yesterdays = useMemo(
    () => pomodoroHistory.filter((p) => p.dayKey === yKey),
    [pomodoroHistory, yKey],
  );
  const totalPomos = useMemo(
    () => yesterdays.reduce((sum, p) => sum + p.count, 0),
    [yesterdays],
  );
  const totalF = useMemo(
    () => yesterdays.reduce((sum, p) => sum + p.fGained + p.bonusF, 0),
    [yesterdays],
  );
  const countsByTag = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of yesterdays) m.set(p.tag, (m.get(p.tag) ?? 0) + p.count);
    return m;
  }, [yesterdays]);

  const fGained = vocab ? 0.5 : 0;
  const hRaw = Object.values(hChecks).reduce(
    (sum, ok) => sum + (ok ? 0.5 : 0),
    0,
  );
  const overnightLoss = Math.min(hRaw, overnightH * 2);
  const hGained = Math.max(0, hRaw - overnightLoss);

  function confirm() {
    settle({ fGained, hGained });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["92%"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 22, paddingBottom: 24 }}
      >
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            SETTLE
          </EditorialText>
          <EditorialText weight="serif" size={26} color={theme.color.ink} style={{ marginTop: 4 }}>
            日终结算
          </EditorialText>
        </View>

        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: theme.color.rule,
            borderRadius: 12,
            gap: 8,
          }}
        >
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            {`昨日 · ${yKey}`}
          </EditorialText>
          <View style={{ flexDirection: "row", gap: 24 }}>
            <Stat label="番茄" value={String(totalPomos)} color={theme.color.ink} />
            <Stat label="已计 F" value={totalF.toFixed(1)} color={theme.color.tomato} />
          </View>
          {countsByTag.size > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {Array.from(countsByTag.entries()).map(([tagId, n]) => {
                const tag = tags.find((t) => t.id === tagId);
                return (
                  <View
                    key={tagId}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: theme.color.paper3,
                    }}
                  >
                    <EditorialText weight="sans" size={11} color={theme.color.ink2}>
                      {`${tag?.label ?? tagId} · ${n}`}
                    </EditorialText>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            番茄外产出
          </EditorialText>
          <Pressable
            onPress={() => setVocab((v) => !v)}
            style={{
              marginTop: 8,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: vocab ? theme.color.tomato : theme.color.rule,
              backgroundColor: vocab ? theme.color.tomatoSoft : "transparent",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <EditorialText weight="kaiti" size={15} color={theme.color.ink}>
              背单词
            </EditorialText>
            <EditorialText weight="mono" size={13} color={vocab ? theme.color.tomato : theme.color.ink3}>
              + 0.5 F
            </EditorialText>
          </Pressable>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            H · 健康自控
          </EditorialText>
          <View style={{ marginTop: 8, gap: 6 }}>
            {H_ITEMS.map((item) => {
              const checked = hChecks[item.id];
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    setHChecks((c) => ({ ...c, [item.id]: !c[item.id] }))
                  }
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: checked ? theme.color.sage : theme.color.rule,
                    backgroundColor: checked ? theme.color.sageSoft : "transparent",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <EditorialText weight="kaiti" size={14} color={theme.color.ink}>
                    {item.label}
                  </EditorialText>
                  <EditorialText weight="mono" size={12} color={checked ? theme.color.sageDeep : theme.color.ink3}>
                    + 0.5 H
                  </EditorialText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <EditorialText weight="sans" size={11} color={theme.color.ink3}>
              熬夜申报
            </EditorialText>
            <EditorialText weight="mono" size={14} color={theme.color.plum}>
              {`${overnightH} h · −${overnightLoss.toFixed(1)} H`}
            </EditorialText>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => {
              const selected = overnightH === h;
              return (
                <Pressable
                  key={h}
                  onPress={() => setOvernightH(h)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: selected ? theme.color.plum : theme.color.rule,
                    backgroundColor: selected ? theme.color.plum : "transparent",
                    alignItems: "center",
                  }}
                >
                  <EditorialText weight="mono" size={13} color={selected ? theme.color.paper : theme.color.ink3}>
                    {String(h)}
                  </EditorialText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={{
            paddingVertical: 18,
            paddingHorizontal: 18,
            borderRadius: 14,
            backgroundColor: theme.color.paper3,
            flexDirection: "row",
            gap: 28,
          }}
        >
          <View style={{ flex: 1 }}>
            <EditorialText weight="sans" size={11} color={theme.color.ink3}>
              今日入账
            </EditorialText>
            <EditorialText weight="serif" size={32} color={theme.color.tomato} style={{ marginTop: 4 }}>
              {`+ ${fGained.toFixed(1)} F`}
            </EditorialText>
            <EditorialText weight="serif" size={32} color={theme.color.sage} style={{ marginTop: 2 }}>
              {`+ ${hGained.toFixed(1)} H`}
            </EditorialText>
          </View>
        </View>

        <Pressable
          onPress={confirm}
          style={{
            paddingVertical: 14,
            backgroundColor: theme.color.ink,
            borderRadius: 12,
          }}
        >
          <EditorialText
            weight="sans"
            size={15}
            color={theme.color.paper}
            style={{ textAlign: "center" }}
          >
            确认结算
          </EditorialText>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View>
      <EditorialText weight="sans" size={11} color={theme.color.ink3}>
        {label}
      </EditorialText>
      <EditorialText weight="serif" size={28} color={color} style={{ marginTop: 2 }}>
        {value}
      </EditorialText>
    </View>
  );
}
