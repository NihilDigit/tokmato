/**
 * Home — pomodoro start / running / remote-active routing.
 *
 * State machine:
 *   - local session  → <RunningView>
 *   - else, remote marker (other device) → <RemoteActiveView>
 *   - else  → idle: balances + start affordance
 */

import { useState } from "react";
import { Pressable, View } from "react-native";
import { useStore } from "@tokmato/shared/store";
import type { KanbanColumnId } from "@tokmato/shared/types";
import { rpc } from "../../lib/rpc-client";
import { PageShell } from "../../components/PageShell";
import { RunningView } from "../../components/RunningView";
import {
  RemoteActiveView,
  useRemoteActive,
} from "../../components/RemoteActiveView";
import { EditorialText } from "../../components/EditorialText";
import { useTheme } from "../../lib/use-theme";
import { StartSheet } from "../../components/sheets/StartSheet";
import { NotesSheet } from "../../components/sheets/NotesSheet";

export default function Home() {
  const session = useStore((s) => s.session);
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const endSession = useStore((s) => s.endSession);
  const moveKanbanCard = useStore((s) => s.moveKanbanCard);
  const addKanbanCard = useStore((s) => s.addKanbanCard);
  const remote = useRemoteActive();
  const theme = useTheme();

  const [startOpen, setStartOpen] = useState(false);
  const [notesReview, setNotesReview] = useState<{
    notes: string[];
    completedCount: number;
  } | null>(null);

  function applyAssignments(
    assignments: { note: string; action: KanbanColumnId | "delete" }[],
    completedCount: number,
  ) {
    for (const a of assignments) {
      if (a.action === "delete") continue;
      const card = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: a.note,
      };
      addKanbanCard({ col: a.action, card });
    }
    void moveKanbanCard;
    endSession({ completedCount });
    void rpc.cancelPushChain().catch(() => {});
    void rpc.clearActiveSession().catch(() => {});
  }

  if (session) {
    return (
      <PageShell>
        <RunningView
          session={session}
          onEnd={(_assignments, completedCount) => {
            const notes = session.notes ?? [];
            if (notes.length > 0) {
              setNotesReview({ notes, completedCount });
            } else {
              applyAssignments([], completedCount);
            }
          }}
        />
        {notesReview ? (
          <NotesSheet
            open
            notes={notesReview.notes}
            onConfirm={(assignments) => {
              applyAssignments(assignments, notesReview.completedCount);
              setNotesReview(null);
            }}
            onClose={() => {
              applyAssignments([], notesReview.completedCount);
              setNotesReview(null);
            }}
          />
        ) : null}
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
          onPress={() => setStartOpen(true)}
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
            开一个番茄
          </EditorialText>
        </Pressable>
      </View>
      <StartSheet open={startOpen} onClose={() => setStartOpen(false)} />
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
