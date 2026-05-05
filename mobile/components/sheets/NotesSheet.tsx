/**
 * NotesSheet — review the notes you typed during a string of pomodoros
 * and decide which kanban column each one lands in (or delete).
 *
 * The web version walks notes one-by-one with assignment chips per
 * note. The RN port keeps the same UX: the sheet shows all notes, a
 * radio-like row of column chips per note, and a confirm button that
 * applies all assignments at once.
 */

import { useState } from "react";
import { Pressable, View } from "react-native";
import type { KanbanColumnId } from "@tokmato/shared/types";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

const COLUMNS: { id: KanbanColumnId | "delete"; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "Q1", label: "Q1" },
  { id: "Q2", label: "Q2" },
  { id: "Q3", label: "Q3" },
  { id: "Q4", label: "Q4" },
  { id: "delete", label: "丢弃" },
];

export function NotesSheet({
  open,
  notes,
  onConfirm,
  onClose,
}: {
  open: boolean;
  notes: string[];
  onConfirm: (
    assignments: { note: string; action: KanbanColumnId | "delete" }[],
  ) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [picks, setPicks] = useState<Record<string, KanbanColumnId | "delete">>(
    () => Object.fromEntries(notes.map((n) => [n, "inbox" as const])),
  );

  function confirm() {
    onConfirm(notes.map((n) => ({ note: n, action: picks[n] ?? "inbox" })));
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["80%"]}>
      <View style={{ gap: 20 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            REVIEW
          </EditorialText>
          <EditorialText
            weight="serif"
            size={26}
            color={theme.color.ink}
            style={{ marginTop: 4 }}
          >
            笔记去哪
          </EditorialText>
        </View>

        <View style={{ gap: 16 }}>
          {notes.map((note) => (
            <View key={note} style={{ gap: 8 }}>
              <EditorialText weight="kaiti" size={15} color={theme.color.ink2}>
                {note}
              </EditorialText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {COLUMNS.map((c) => {
                  const selected = picks[note] === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setPicks((p) => ({ ...p, [note]: c.id }))}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderWidth: 1,
                        borderColor: selected ? theme.color.ink : theme.color.rule,
                        backgroundColor: selected
                          ? theme.color.paper3
                          : "transparent",
                        borderRadius: 14,
                      }}
                    >
                      <EditorialText
                        weight="sans"
                        size={11}
                        color={selected ? theme.color.ink : theme.color.ink3}
                      >
                        {c.label}
                      </EditorialText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={confirm}
          style={{
            marginTop: 12,
            paddingVertical: 14,
            backgroundColor: theme.color.tomato,
            borderRadius: 12,
          }}
        >
          <EditorialText
            weight="sans"
            size={15}
            color={theme.color.paper}
            style={{ textAlign: "center" }}
          >
            确认
          </EditorialText>
        </Pressable>
      </View>
    </Sheet>
  );
}
