/**
 * EditTagSheet — add or edit a tag (label + color).
 *
 * RN port of `components/sheets/EditTagSheet.tsx`. Color picker walks
 * the same 10-color palette declared in `@tokmato/shared/types`. Edit
 * mode shows a delete button with arm-then-confirm guard.
 */

import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import { TAG_COLORS, type TagColor, type TagConfig } from "@tokmato/shared/types";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";

export function EditTagSheet({
  open,
  onClose,
  tag,
}: {
  open: boolean;
  onClose: () => void;
  /** When provided, the sheet is in edit mode. */
  tag: TagConfig | null;
}) {
  const theme = useTheme();
  const addTag = useStore((s) => s.addTag);
  const updateTag = useStore((s) => s.updateTag);
  const removeTag = useStore((s) => s.removeTag);

  const isEdit = !!tag;
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<TagColor>("tomato");
  const [armDelete, setArmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(tag?.label ?? "");
    setColor(tag?.color ?? "tomato");
    setArmDelete(false);
  }, [open, tag]);

  const trimmed = label.trim();
  const canSave = trimmed.length > 0;

  function save() {
    if (!canSave) return;
    if (isEdit && tag) {
      updateTag(tag.id, { label: trimmed, color });
    } else {
      addTag({ label: trimmed, color });
    }
    onClose();
  }

  function handleDelete() {
    if (!tag) return;
    if (!armDelete) {
      setArmDelete(true);
      return;
    }
    removeTag(tag.id);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["70%"]}>
      <View style={{ gap: 22 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            {isEdit ? "EDIT TAG" : "NEW TAG"}
          </EditorialText>
          <EditorialText weight="serif" size={26} color={theme.color.ink} style={{ marginTop: 4 }}>
            {isEdit ? "编辑 Tag" : "新建 Tag"}
          </EditorialText>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            名称
          </EditorialText>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="#math"
            placeholderTextColor={theme.color.inkMute}
            maxLength={50}
            autoFocus
            style={{
              marginTop: 6,
              paddingVertical: 8,
              fontSize: 19,
              color: theme.color.ink,
              fontFamily: theme.fonts.serif,
              borderBottomWidth: 2,
              borderBottomColor: theme.color.rule,
            }}
          />
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            颜色
          </EditorialText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {TAG_COLORS.map((c) => {
              const active = c === color;
              return (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: theme.color[c],
                    borderWidth: active ? 2.5 : 1,
                    borderColor: active ? theme.color.ink : theme.color.rule,
                    transform: [{ scale: active ? 1.1 : 1 }],
                  }}
                />
              );
            })}
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: theme.color.rule,
          }}
        >
          {isEdit ? (
            <Pressable
              onPress={handleDelete}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: armDelete ? theme.color.plum : "transparent",
              }}
            >
              <EditorialText
                weight="sans"
                size={13}
                color={armDelete ? theme.color.paper : theme.color.plum}
              >
                {armDelete ? "再点确认 · 同时删 bonus" : "删除"}
              </EditorialText>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={{
              paddingHorizontal: 22,
              paddingVertical: 12,
              borderRadius: 22,
              backgroundColor: canSave ? theme.color.ink : theme.color.paper3,
              opacity: canSave ? 1 : 0.5,
            }}
          >
            <EditorialText weight="sans" size={14} color={theme.color.paper}>
              保存
            </EditorialText>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}
