/**
 * AddKanbanSheet — replaces the legacy `window.prompt` for new card
 * input. Mirrors `components/sheets/AddKanbanSheet.tsx` (web).
 */

import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { KanbanColumnId } from "@tokmato/shared/types";
import { useStore } from "@tokmato/shared/store";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

const COLUMNS: { id: KanbanColumnId; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "Q1", label: "Q1" },
  { id: "Q2", label: "Q2" },
  { id: "Q3", label: "Q3" },
  { id: "Q4", label: "Q4" },
];

export function AddKanbanSheet({
  open,
  onClose,
  defaultColumn = "inbox",
}: {
  open: boolean;
  onClose: () => void;
  defaultColumn?: KanbanColumnId;
}) {
  const theme = useTheme();
  const addKanbanCard = useStore((s) => s.addKanbanCard);
  const [text, setText] = useState("");
  const [col, setCol] = useState<KanbanColumnId>(defaultColumn);

  function confirm() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const card = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
    };
    addKanbanCard({ col, card });
    setText("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["55%"]}>
      <View style={{ gap: 16 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            NEW CARD
          </EditorialText>
          <EditorialText
            weight="serif"
            size={26}
            color={theme.color.ink}
            style={{ marginTop: 4 }}
          >
            新任务
          </EditorialText>
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="标题"
          placeholderTextColor={theme.color.inkMute}
          style={{
            paddingVertical: 10,
            fontSize: 17,
            color: theme.color.ink,
            fontFamily: theme.fonts.kaiti,
            borderBottomWidth: 1,
            borderBottomColor: theme.color.rule,
          }}
        />

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            放到
          </EditorialText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {COLUMNS.map((c) => {
              const selected = c.id === col;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCol(c.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderColor: selected ? theme.color.ink : theme.color.rule,
                    backgroundColor: selected ? theme.color.paper3 : "transparent",
                    borderRadius: 16,
                  }}
                >
                  <EditorialText
                    weight="sans"
                    size={13}
                    color={selected ? theme.color.ink : theme.color.ink3}
                  >
                    {c.label}
                  </EditorialText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={confirm}
          disabled={!text.trim()}
          style={{
            marginTop: 8,
            paddingVertical: 14,
            backgroundColor: text.trim() ? theme.color.ink : theme.color.paper3,
            borderRadius: 12,
            opacity: text.trim() ? 1 : 0.5,
          }}
        >
          <EditorialText
            weight="sans"
            size={15}
            color={theme.color.paper}
            style={{ textAlign: "center" }}
          >
            添加
          </EditorialText>
        </Pressable>
      </View>
    </Sheet>
  );
}
