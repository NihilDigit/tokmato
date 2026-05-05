/**
 * StartSheet — task + tag + type selection before kicking off a pomodoro.
 * Mirrors `components/sheets/StartSheet.tsx` (web) but uses a native
 * TextInput and pressable tag chips.
 *
 * On confirm, calls the store's `startSession`, then arms the push
 * chain and sets the cross-device active marker via REST RPC. Web
 * keeps using the action-based flow.
 */

import { useState } from "react";
import {
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { TagId, SessionType } from "@tokmato/shared/types";
import { Sheet } from "./Sheet";
import { EditorialText } from "../EditorialText";
import { useTheme } from "../../lib/use-theme";
import { rpc } from "../../lib/rpc-client";

const TYPES: { id: SessionType; label: string; hint: string }[] = [
  { id: "input", label: "输入", hint: "听课 / 阅读 · 1 F" },
  { id: "output", label: "输出", hint: "做题 / 写作 · 0.5 F" },
];

export function StartSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const tags = useStore((s) => s.tags);
  const startSession = useStore((s) => s.startSession);
  const recentTasks = useStore((s) => s.recentTasks);

  const [task, setTask] = useState("");
  const [tag, setTag] = useState<TagId>(tags[0]?.id ?? "others");
  const [type, setType] = useState<SessionType>("input");

  function reset() {
    setTask("");
    setTag(tags[0]?.id ?? "others");
    setType("input");
  }

  function confirm() {
    const trimmed = task.trim();
    startSession({ task: trimmed, tag, type });
    const startedAt = Date.now();
    void rpc
      .startPushChain({
        sessionId: String(startedAt),
        boundaryAt: startedAt + 25 * 60 * 1000,
        kind: "running-end",
        count: 1,
      })
      .catch(() => {});
    void rpc
      .setActiveSession({
        task: trimmed,
        tag,
        type,
        startedAt,
        phaseStartedAt: startedAt,
        mode: "running",
        count: 1,
      })
      .catch(() => {});
    reset();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} snapPoints={["75%"]}>
      <View style={{ gap: 20 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            START
          </EditorialText>
          <EditorialText
            weight="serif"
            size={28}
            color={theme.color.ink}
            style={{ marginTop: 4 }}
          >
            开一个番茄
          </EditorialText>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            做什么
          </EditorialText>
          <TextInput
            value={task}
            onChangeText={setTask}
            placeholder="可以留空"
            placeholderTextColor={theme.color.inkMute}
            style={{
              marginTop: 8,
              paddingVertical: 10,
              fontSize: 18,
              color: theme.color.ink,
              fontFamily: theme.fonts.kaiti,
              borderBottomWidth: 1,
              borderBottomColor: theme.color.rule,
            }}
          />
          {recentTasks.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {recentTasks.slice(0, 5).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setTask(t)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: theme.color.rule,
                    borderRadius: 14,
                  }}
                >
                  <EditorialText weight="kaiti" size={12} color={theme.color.ink2}>
                    {t}
                  </EditorialText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            标签
          </EditorialText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {tags.map((t) => {
              const selected = t.id === tag;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTag(t.id)}
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
                    #{t.id}
                  </EditorialText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            类型
          </EditorialText>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            {TYPES.map((t) => {
              const selected = type === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setType(t.id)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: selected ? theme.color.ink : theme.color.rule,
                    backgroundColor: selected ? theme.color.paper3 : "transparent",
                    borderRadius: 10,
                  }}
                >
                  <EditorialText weight="serif" size={16} color={theme.color.ink}>
                    {t.label}
                  </EditorialText>
                  <EditorialText weight="sans" size={11} color={theme.color.ink3} style={{ marginTop: 2 }}>
                    {t.hint}
                  </EditorialText>
                </Pressable>
              );
            })}
          </View>
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
            开始
          </EditorialText>
        </Pressable>
      </View>
    </Sheet>
  );
}
