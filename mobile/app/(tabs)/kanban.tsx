/**
 * Kanban — RN port. 5 segmented tabs across the top (Inbox / Q1-Q4),
 * single column body. Tap card → edit (Phase 5b sheet). Long-press
 * (~360ms) → radial move menu.
 *
 * The radial menu is the single biggest UX win RN unlocks: gestures
 * drive directly via `react-native-gesture-handler` instead of going
 * through React's pointer-event handlers + setState on every move,
 * which on web stuttered on mid-range Android.
 */

import { useState } from "react";
import { Pressable, View, ScrollView } from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { useStore } from "@tokmato/shared/store";
import type {
  KanbanCard,
  KanbanColumnId,
} from "@tokmato/shared/types";
import { PageShell } from "../../components/PageShell";
import { EditorialText } from "../../components/EditorialText";
import { useTheme } from "../../lib/use-theme";
import {
  RadialMoveMenu,
  pointerToTarget,
} from "../../components/RadialMoveMenu";
import { AddKanbanSheet } from "../../components/sheets/AddKanbanSheet";

const COLS: { id: KanbanColumnId; short: string; label: string }[] = [
  { id: "inbox", short: "Inbox", label: "未分类" },
  { id: "Q1", short: "Q1", label: "重要紧急" },
  { id: "Q2", short: "Q2", label: "重要不紧急" },
  { id: "Q3", short: "Q3", label: "紧急不重要" },
  { id: "Q4", short: "Q4", label: "都不" },
];

type RadialState = {
  card: KanbanCard;
  fromCol: KanbanColumnId;
  anchor: { x: number; y: number };
  pointer: { x: number; y: number };
  active: KanbanColumnId | null;
};

export default function Kanban() {
  const theme = useTheme();
  const kanban = useStore((s) => s.kanban);
  const moveCard = useStore((s) => s.moveKanbanCard);

  const [activeCol, setActiveCol] = useState<KanbanColumnId>("inbox");
  const [radial, setRadial] = useState<RadialState | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <PageShell>
      <View style={{ flex: 1, gap: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <EditorialText weight="sans" size={11} color={theme.color.ink3}>
              KANBAN
            </EditorialText>
            <EditorialText weight="serif" size={28} color={theme.color.ink} style={{ marginTop: 4 }}>
              四象限
            </EditorialText>
          </View>
          <Pressable
            onPress={() => setAddOpen(true)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: theme.color.ink,
              borderRadius: 16,
            }}
          >
            <EditorialText weight="sans" size={12} color={theme.color.ink}>
              + 新任务
            </EditorialText>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {COLS.map((c) => {
            const selected = c.id === activeCol;
            return (
              <Pressable
                key={c.id}
                onPress={() => setActiveCol(c.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: selected ? theme.color.ink : theme.color.rule,
                  backgroundColor: selected ? theme.color.paper3 : "transparent",
                }}
              >
                <EditorialText
                  weight="sans"
                  size={12}
                  color={selected ? theme.color.ink : theme.color.ink3}
                >
                  {c.short} · {kanban[c.id].length}
                </EditorialText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80, gap: 8 }}
        >
          {kanban[activeCol].length === 0 ? (
            <EditorialText weight="sans" size={13} color={theme.color.ink3}>
              这一格空了。
            </EditorialText>
          ) : (
            kanban[activeCol].map((card) => (
              <CardRow
                key={card.id}
                card={card}
                fromCol={activeCol}
                onLongPressStart={(anchor) =>
                  setRadial({
                    card,
                    fromCol: activeCol,
                    anchor,
                    pointer: anchor,
                    active: null,
                  })
                }
                onPanUpdate={(pointer) =>
                  setRadial((r) =>
                    r && r.card.id === card.id
                      ? {
                          ...r,
                          pointer,
                          active: pointerToTarget(r.anchor, pointer, r.fromCol),
                        }
                      : r,
                  )
                }
                onPanEnd={() => {
                  setRadial((r) => {
                    if (r && r.card.id === card.id && r.active && r.active !== r.fromCol) {
                      moveCard({ cardId: r.card.id, toCol: r.active });
                    }
                    return null;
                  });
                }}
              />
            ))
          )}
        </ScrollView>
      </View>

      {radial ? (
        <RadialMoveMenu
          anchor={radial.anchor}
          pointer={radial.pointer}
          active={radial.active}
          fromCol={radial.fromCol}
        />
      ) : null}

      <AddKanbanSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultColumn={activeCol}
      />
    </PageShell>
  );
}

function CardRow({
  card,
  fromCol,
  onLongPressStart,
  onPanUpdate,
  onPanEnd,
}: {
  card: KanbanCard;
  fromCol: KanbanColumnId;
  onLongPressStart: (anchor: { x: number; y: number }) => void;
  onPanUpdate: (pointer: { x: number; y: number }) => void;
  onPanEnd: () => void;
}) {
  void fromCol;
  const theme = useTheme();

  // Long-press starts the radial; pan keeps it tracking; release commits.
  // Both run on JS so they can call setState in the parent.
  const longPress = Gesture.LongPress()
    .minDuration(360)
    .maxDistance(20)
    .runOnJS(true)
    .onStart((e) => {
      onLongPressStart({ x: e.absoluteX, y: e.absoluteY });
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      onPanUpdate({ x: e.absoluteX, y: e.absoluteY });
    })
    .onEnd(() => {
      onPanEnd();
    })
    .onFinalize(() => {
      onPanEnd();
    });

  const composed = Gesture.Simultaneous(longPress, pan);

  return (
    <GestureDetector gesture={composed}>
      <View
        style={{
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: theme.color.paper2,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.color.rule,
        }}
      >
        <EditorialText weight="kaiti" size={15} color={theme.color.ink}>
          {card.name}
        </EditorialText>
        {card.next ? (
          <EditorialText
            weight="sans"
            size={11}
            color={theme.color.ink3}
            style={{ marginTop: 4 }}
          >
            ↳ {card.next}
          </EditorialText>
        ) : null}
      </View>
    </GestureDetector>
  );
}
