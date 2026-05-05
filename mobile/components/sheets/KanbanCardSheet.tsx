/**
 * KanbanCardSheet — unified add/edit form for a kanban card.
 *
 * RN port of `components/sheets/KanbanCardSheet.tsx`. Add mode opens
 * with empty fields; edit mode prefills + surfaces a 删除 button with
 * the same arm-then-confirm guard (first tap arms, second tap
 * commits).
 */

import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { KanbanCard, KanbanColumnId } from "@tokmato/shared/types";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

const COL_LABEL: Record<KanbanColumnId, string> = {
  inbox: "Inbox",
  Q1: "Q1 主线 deadline",
  Q2: "Q2 长期投资",
  Q3: "Q3 不可避免杂事",
  Q4: "Q4 精神维护",
};

export function KanbanCardSheet({
  open,
  onClose,
  col,
  card,
}: {
  open: boolean;
  onClose: () => void;
  col: KanbanColumnId | null;
  card: KanbanCard | null;
}) {
  const theme = useTheme();
  const updateKanbanCard = useStore((s) => s.updateKanbanCard);
  const removeKanbanCard = useStore((s) => s.removeKanbanCard);

  const isEdit = !!card;
  const [name, setName] = useState("");
  const [next, setNext] = useState("");
  const [armDelete, setArmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(card?.name ?? "");
    setNext(card?.next ?? "");
    setArmDelete(false);
  }, [open, card]);

  const valid = name.trim().length > 0;
  const colorAccent = colAccent(col, theme);

  function confirm() {
    if (!valid || !card) return;
    updateKanbanCard({
      cardId: card.id,
      patch: { name: name.trim(), next: next.trim() || undefined },
    });
    onClose();
  }

  function handleDelete() {
    if (!card) return;
    if (!armDelete) {
      setArmDelete(true);
      return;
    }
    removeKanbanCard(card.id);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["70%"]}>
      <View style={{ gap: 22 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            {isEdit ? "EDIT" : "NEW"}
          </EditorialText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <EditorialText weight="serif" size={26} color={theme.color.ink}>
              {isEdit ? "编辑任务" : "新任务"}
            </EditorialText>
            <EditorialText weight="mono" size={13} color={colorAccent}>
              {col ? `· ${COL_LABEL[col]}` : ""}
            </EditorialText>
          </View>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            任务
          </EditorialText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="一句话写清楚要做什么"
            placeholderTextColor={theme.color.inkMute}
            autoFocus
            style={{
              marginTop: 6,
              paddingVertical: 8,
              fontSize: 18,
              color: theme.color.ink,
              fontFamily: theme.fonts.serif,
              borderBottomWidth: 2,
              borderBottomColor: theme.color.rule,
            }}
          />
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            下一步（选填）
          </EditorialText>
          <TextInput
            value={next}
            onChangeText={setNext}
            placeholder="第一个具体动作"
            placeholderTextColor={theme.color.inkMute}
            maxLength={200}
            style={{
              marginTop: 6,
              paddingVertical: 6,
              fontSize: 14,
              color: theme.color.ink2,
              fontFamily: theme.fonts.kaiti,
              borderBottomWidth: 1,
              borderBottomColor: theme.color.rule,
            }}
          />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          {isEdit ? (
            <Pressable
              onPress={handleDelete}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: armDelete ? theme.color.tomato : "transparent",
              }}
            >
              <EditorialText
                weight="sans"
                size={13}
                color={armDelete ? theme.color.paper : theme.color.ink3}
              >
                {armDelete ? "再点一次确认" : "删除"}
              </EditorialText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            onPress={confirm}
            disabled={!valid}
            style={{
              paddingHorizontal: 22,
              paddingVertical: 12,
              borderRadius: 22,
              backgroundColor: valid ? theme.color.ink : theme.color.paper3,
              opacity: valid ? 1 : 0.5,
            }}
          >
            <EditorialText weight="sans" size={14} color={theme.color.paper}>
              {isEdit ? "保存" : "添加"}
            </EditorialText>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

function colAccent(col: KanbanColumnId | null, theme: ReturnType<typeof useTheme>): string {
  switch (col) {
    case "Q1":
      return theme.color.tomato;
    case "Q2":
      return theme.color.sage;
    case "Q3":
      return theme.color.plum;
    case "Q4":
      return theme.color.gold;
    default:
      return theme.color.inkMute;
  }
}
