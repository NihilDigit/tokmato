/**
 * PlaySheet — kick off an entertainment timer.
 *
 * Mirrors `components/sheets/PlaySheet.tsx` (web). Type segmented (主动 ×1
 * vs 被动 ×2), minutes via −/+ stepper bounded by pool, optional kanban
 * binding. Confirms by calling `startPlay` on the shared store; the
 * running overlay (`EntertainmentRunningView`) takes over the screen
 * via `playSession` watch in `app/_layout.tsx`.
 *
 * Slider on web is `<input type="range">` — RN has no first-class
 * slider in core, so this port uses a stepper (−/+ × 5min, with a row
 * of preset chips). Simpler thumb math, no extra dep.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { KanbanCard, KanbanColumnId, PlayType } from "@tokmato/shared/types";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

const MIN_MINUTES = 5;
const STEP = 5;
const ACTIVE_MAX = 240;
const PASSIVE_MAX = 120;
const PRESETS = [15, 30, 60, 90, 120];

const COL_LABEL: Record<KanbanColumnId, string> = {
  inbox: "Inbox",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
};

export function PlaySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const timePool = useStore((s) => s.timePool);
  const kanban = useStore((s) => s.kanban);
  const startPlay = useStore((s) => s.startPlay);

  const [type, setType] = useState<PlayType>("active");
  const [minutes, setMinutes] = useState(30);
  const [kanbanCardId, setKanbanCardId] = useState<string | undefined>(undefined);

  const typeMax = type === "active" ? ACTIVE_MAX : PASSIVE_MAX;
  const poolCeiling = type === "passive" ? Math.floor(timePool / 2) : timePool;
  const sliderMax = Math.max(MIN_MINUTES, Math.min(typeMax, poolCeiling));
  const cost = type === "passive" ? minutes * 2 : minutes;
  const overBudget = cost > timePool;
  const poolEmpty = timePool < MIN_MINUTES;

  useEffect(() => {
    setMinutes((m) => Math.max(MIN_MINUTES, Math.min(m, typeMax)));
  }, [typeMax]);

  useEffect(() => {
    if (!open) return;
    setMinutes((m) => Math.max(MIN_MINUTES, Math.min(m, sliderMax)));
    setKanbanCardId(undefined);
  }, [open, sliderMax]);

  const cards = useMemo(
    () =>
      (Object.entries(kanban) as [KanbanColumnId, KanbanCard[]][]).flatMap(
        ([col, list]) => list.map((card) => ({ col, card })),
      ),
    [kanban],
  );

  function bump(delta: number) {
    setMinutes((m) =>
      Math.max(MIN_MINUTES, Math.min(sliderMax, Math.round((m + delta) / 5) * 5)),
    );
  }

  function confirm() {
    if (overBudget || poolEmpty) return;
    const card = cards.find((c) => c.card.id === kanbanCardId)?.card;
    startPlay({
      type,
      minutes,
      costMinutes: cost,
      ...(card ? { task: card.name, kanbanCardId: card.id } : {}),
    });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["80%"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 22, paddingBottom: 16 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            PLAY
          </EditorialText>
          <EditorialText weight="serif" size={26} color={theme.color.ink} style={{ marginTop: 4 }}>
            玩点什么
          </EditorialText>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.color.rule,
          }}
        >
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            时间池
          </EditorialText>
          <EditorialText weight="mono" size={26} color={theme.color.tealDeep}>
            {`${timePool} min`}
          </EditorialText>
        </View>

        <View style={{ alignItems: "center", paddingVertical: 4 }}>
          {type === "passive" ? (
            <EditorialText weight="mono" size={32} color={overBudget ? theme.color.plum : theme.color.ink}>
              {`${minutes} × 2 = ${cost}`}
            </EditorialText>
          ) : (
            <EditorialText weight="mono" size={56} color={overBudget ? theme.color.plum : theme.color.ink}>
              {String(minutes)}
            </EditorialText>
          )}
          <EditorialText weight="sans" size={11} color={theme.color.ink3} style={{ marginTop: 6 }}>
            {type === "passive" ? "实扣分钟" : "分钟"}
          </EditorialText>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <StepBtn label="−" onPress={() => bump(-STEP)} disabled={minutes <= MIN_MINUTES} />
          <StepBtn label="＋" onPress={() => bump(STEP)} disabled={minutes >= sliderMax} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PRESETS.filter((p) => p <= sliderMax).map((p) => {
            const selected = minutes === p;
            return (
              <Pressable
                key={p}
                onPress={() => setMinutes(p)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: selected ? theme.color.ink : theme.color.rule,
                  backgroundColor: selected ? theme.color.paper3 : "transparent",
                }}
              >
                <EditorialText weight="mono" size={12} color={selected ? theme.color.ink : theme.color.ink3}>
                  {`${p}m`}
                </EditorialText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            类型
          </EditorialText>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <TypeButton
              active={type === "active"}
              label="主动型"
              hint="× 1"
              tone={theme.color.sage}
              onPress={() => setType("active")}
            />
            <TypeButton
              active={type === "passive"}
              label="被动型"
              hint="× 2"
              tone={theme.color.plum}
              onPress={() => setType("passive")}
            />
          </View>
        </View>

        {cards.length > 0 ? (
          <View>
            <EditorialText weight="sans" size={11} color={theme.color.ink3}>
              绑定 Kanban
            </EditorialText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingTop: 8 }}
            >
              <Pressable
                onPress={() => setKanbanCardId(undefined)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: !kanbanCardId ? theme.color.ink : theme.color.rule,
                  backgroundColor: !kanbanCardId ? theme.color.paper3 : "transparent",
                }}
              >
                <EditorialText
                  weight="sans"
                  size={12}
                  color={!kanbanCardId ? theme.color.ink : theme.color.ink3}
                >
                  不绑定
                </EditorialText>
              </Pressable>
              {cards.map(({ col, card }) => {
                const selected = card.id === kanbanCardId;
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => setKanbanCardId(card.id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: selected ? theme.color.ink : theme.color.rule,
                      backgroundColor: selected ? theme.color.paper3 : "transparent",
                      maxWidth: 200,
                    }}
                  >
                    <EditorialText
                      weight="kaiti"
                      size={12}
                      color={selected ? theme.color.ink : theme.color.ink3}
                      numberOfLines={1}
                    >
                      {`${COL_LABEL[col]} · ${card.name}`}
                    </EditorialText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {poolEmpty ? (
          <EditorialText weight="sans" size={12} color={theme.color.ink3}>
            时间池空了，先去番茄页攒一会儿。
          </EditorialText>
        ) : overBudget ? (
          <EditorialText weight="sans" size={12} color={theme.color.plum}>
            {`时间池不够 · 还差 ${cost - timePool} min`}
          </EditorialText>
        ) : null}

        <Pressable
          onPress={confirm}
          disabled={overBudget || poolEmpty}
          style={{
            paddingVertical: 14,
            backgroundColor:
              overBudget || poolEmpty ? theme.color.paper3 : theme.color.tomato,
            borderRadius: 12,
            opacity: overBudget || poolEmpty ? 0.5 : 1,
          }}
        >
          <EditorialText
            weight="sans"
            size={15}
            color={theme.color.paper}
            style={{ textAlign: "center" }}
          >
            {`启动 ${minutes} 分钟`}
          </EditorialText>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

function StepBtn({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 56,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.color.rule,
        justifyContent: "center",
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <EditorialText weight="serif" size={22} color={theme.color.ink}>
        {label}
      </EditorialText>
    </Pressable>
  );
}

function TypeButton({
  active,
  label,
  hint,
  tone,
  onPress,
}: {
  active: boolean;
  label: string;
  hint: string;
  tone: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? "transparent" : theme.color.rule,
        backgroundColor: active ? tone : "transparent",
        alignItems: "center",
      }}
    >
      <EditorialText weight="serif" italic size={18} color={active ? theme.color.paper : theme.color.ink}>
        {label}
      </EditorialText>
      <EditorialText
        weight="mono"
        size={11}
        color={active ? theme.color.paper : theme.color.ink3}
        style={{ marginTop: 2 }}
      >
        {hint}
      </EditorialText>
    </Pressable>
  );
}
