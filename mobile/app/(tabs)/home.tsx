/**
 * Home — pomodoro start / running / remote-active routing.
 *
 * State machine:
 *   - local session  → <RunningView>
 *   - else, remote marker (other device) → <RemoteActiveView>
 *   - else  → idle: balances + quick start
 */

import { Pressable, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import { rpc } from "../../lib/rpc-client";
import { PageShell } from "../../components/PageShell";
import { RunningView } from "../../components/RunningView";
import {
  RemoteActiveView,
  useRemoteActive,
} from "../../components/RemoteActiveView";
import { EditorialText } from "../../components/EditorialText";
import { useTheme } from "../../lib/use-theme";

export default function Home() {
  const session = useStore((s) => s.session);
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const tags = useStore((s) => s.tags);
  const startSession = useStore((s) => s.startSession);
  const endSession = useStore((s) => s.endSession);
  const remote = useRemoteActive();
  const theme = useTheme();

  if (session) {
    return (
      <PageShell>
        <RunningView
          session={session}
          onEnd={(_assignments, completedCount) => {
            endSession({ completedCount });
            void rpc.cancelPushChain().catch(() => {});
            void rpc.clearActiveSession().catch(() => {});
          }}
        />
      </PageShell>
    );
  }

  if (remote) {
    return (
      <PageShell>
        <RemoteActiveView marker={remote} />
      </PageShell>
    );
  }

  const defaultTag = tags[0]?.id ?? "others";

  function quickStart() {
    startSession({ task: "", tag: defaultTag, type: "input" });
    const startedAt = Date.now();
    const sessionId = String(startedAt);
    void rpc
      .startPushChain({
        sessionId,
        boundaryAt: startedAt + 25 * 60 * 1000,
        kind: "running-end",
        count: 1,
      })
      .catch(() => {});
    void rpc
      .setActiveSession({
        task: "",
        tag: defaultTag,
        type: "input",
        startedAt,
        phaseStartedAt: startedAt,
        mode: "running",
        count: 1,
      })
      .catch(() => {});
  }

  return (
    <PageShell>
      <View style={{ gap: 32 }}>
        <View>
          <EditorialText weight="sans" size={11} color={theme.color.ink3}>
            TODAY
          </EditorialText>
          <View style={{ marginTop: 16, flexDirection: "row", gap: 32, flexWrap: "wrap" }}>
            <Stat label="FToken" value={ftoken} color={theme.color.tomato} />
            <Stat label="HToken" value={htoken} color={theme.color.sage} />
            <Stat label="时间池" value={`${timePool} min`} color={theme.color.tealDeep} />
          </View>
        </View>

        <Pressable
          onPress={quickStart}
          style={{
            alignSelf: "flex-start",
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderWidth: 1,
            borderColor: theme.color.ink,
            borderRadius: 12,
          }}
        >
          <EditorialText weight="sans" size={15} color={theme.color.ink}>
            开始一个番茄
          </EditorialText>
        </Pressable>
        <EditorialText weight="sans" size={12} color={theme.color.ink3}>
          快速启动 · 默认标签 #{defaultTag} · 输入型 · 25 分钟
        </EditorialText>
      </View>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View>
      <EditorialText weight="sans" size={11} color={theme.color.ink3}>
        {label}
      </EditorialText>
      <EditorialText
        weight="serif"
        size={48}
        color={color}
        style={{ marginTop: 4, lineHeight: 50 }}
      >
        {String(value)}
      </EditorialText>
    </View>
  );
}
