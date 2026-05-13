"use client";

/**
 * RunningView — Home tab's running-pomodoro state.
 *
 * Clock-based: countdown is computed every tick from
 * `Date.now() - session.phaseStartedAt`, never decremented from local
 * state. So if the tab is throttled or briefly closed and reopened,
 * the displayed time stays correct and crossed pomodoro boundaries are
 * caught up by `advancePomodoroPhase()`.
 *
 * v9: the running/buffer phase split is gone. A pomodoro string runs
 * continuously — every 25 min the count rolls forward. Long-press end
 * branches by elapsed-into-current-pomodoro:
 *   - elapsed < 13 min → discard the current pomodoro (awardCount = count - 1)
 *   - elapsed ≥ 13 min → let the user either discard, or fill in what
 *     they actually accomplished and have it counted as a full pomodoro
 *     (awardCount = count).
 */

import { useEffect, useRef, useState } from "react";
import { TomatoIcon } from "@/components/animations/TomatoIcon";
import { NotesSheet } from "@/components/sheets/NotesSheet";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useHoldConfirm } from "@/components/timer/use-hold-confirm";
import { useWallClockNow } from "@/components/timer/use-wall-clock-now";
import type { PomodoroSession, KanbanColumnId } from "@/lib/types";

const POMO_MS = 25 * 60 * 1000;
/** Keep-or-discard cutoff: a pomodoro that ran at least this long can be
 *  preserved with a written reason. Anything shorter is always discarded. */
const KEEP_THRESHOLD_MS = 13 * 60 * 1000;

const TAG_TONE: Record<string, { bg: string; text: string }> = {
  cs: { bg: "bg-paper-2", text: "text-ink" },
  math: { bg: "bg-tomato", text: "text-white" },
  english: { bg: "bg-sage", text: "text-white" },
  others: { bg: "bg-gold-soft", text: "text-ink" },
  trash: { bg: "bg-plum", text: "text-white" },
};

const TAG_LABEL: Record<string, string> = {
  cs: "#cs",
  math: "#math",
  english: "#english",
  others: "#others",
  trash: "#trash",
};

function fmtMmSs(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function fireNotification(title: string, body: string) {
  try {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body, icon: "/icon.png", tag: "tokmato-pomodoro" });
    }
  } catch {
    // ignore — Notification can throw on some embedded contexts
  }
}

export interface RunningViewProps {
  session: PomodoroSession;
  /** Called when the session is fully resolved (after notes review).
   *  `assignments` maps each note to a kanban column or "delete". */
  onEnd: (
    assignments: { note: string; action: KanbanColumnId | "delete" }[],
    completedCount: number,
    feedback: { result: string }
  ) => void;
}

export function RunningView({ session, onEnd }: RunningViewProps) {
  const advancePhase = useStore((s) => s.advancePomodoroPhase);
  const addNoteToSession = useStore((s) => s.addNoteToSession);

  const { count, phaseStartedAt } = session;

  // Notes typed during this string of pomodoros — read straight from
  // the persisted session so a refresh / remount keeps them. Local
  // React state used to hold these and was lost across reloads.
  const notes = session.notes ?? [];
  const [noteDraft, setNoteDraft] = useState("");

  // End flow state
  const [showNotesSheet, setShowNotesSheet] = useState(false);
  const [showEndSheet, setShowEndSheet] = useState(false);
  const [pendingNotes, setPendingNotes] = useState<string[]>([]);
  /** Locked at the moment the long-press completes so the sheet's mode
   *  doesn't flip mid-confirmation if the user dwells past 13 min. */
  const [endElapsedMs, setEndElapsedMs] = useState(0);
  const pendingAwardCountRef = useRef(0);
  const pendingFeedbackRef = useRef<{ result: string } | null>(null);
  const endResolvedRef = useRef(false);

  // Wall-clock tick — single source of truth for displayed time.
  const now = useWallClockNow({ paused: showNotesSheet || showEndSheet });

  // Track which boundary we've already notified for, to avoid double-fire
  // if the auto-advance and tick both observe the same crossing.
  const lastNotifiedBoundaryRef = useRef<number | null>(null);

  // ─── Notification permission — request once on first mount ─────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Best-effort. Some browsers gate this behind a user gesture; if
      // it fails silently, we just don't get notifications.
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // ─── Auto-advance + notify when a pomodoro boundary crosses ────────────
  useEffect(() => {
    if (showNotesSheet || showEndSheet) return;
    const elapsed = now - phaseStartedAt;
    if (elapsed < POMO_MS) return;
    const boundaryAt = phaseStartedAt + POMO_MS;
    if (lastNotifiedBoundaryRef.current !== boundaryAt) {
      lastNotifiedBoundaryRef.current = boundaryAt;
      fireNotification("番茄完成", `第 ${count + 1} 个番茄开始`);
    }
    advancePhase({ now });
  }, [now, count, phaseStartedAt, advancePhase, showNotesSheet, showEndSheet]);

  // Long-press end is a *deliberate cut-off*, not a celebration —
  // skip confetti and go straight to the end-feedback sheet.
  const triggerEnd = () => {
    if (endResolvedRef.current) return;
    const finalNotes = noteDraft.trim()
      ? [...notes, noteDraft.trim()]
      : notes;
    setEndElapsedMs(Math.max(0, Date.now() - phaseStartedAt));
    setPendingNotes(finalNotes);
    setShowEndSheet(true);
  };

  const finalizeEnd = (
    assignments: { note: string; action: KanbanColumnId | "delete" }[]
  ) => {
    if (endResolvedRef.current) return;
    endResolvedRef.current = true;
    onEnd(
      assignments,
      pendingAwardCountRef.current,
      pendingFeedbackRef.current ?? { result: session.task },
    );
  };

  const handleEndFeedbackConfirm = (data: {
    awardCount: number;
    result: string;
  }) => {
    pendingAwardCountRef.current = data.awardCount;
    pendingFeedbackRef.current = { result: data.result };
    setShowEndSheet(false);
    if (pendingNotes.length > 0) {
      setShowNotesSheet(true);
      return;
    }
    finalizeEnd([]);
  };

  const handleNotesConfirm = (assignments: { note: string; action: KanbanColumnId | "delete" }[]) => {
    setShowNotesSheet(false);
    finalizeEnd(assignments);
  };

  // ─── Long-press end flow ────────────────────────────────────────────────
  const { holding, startHold, cancelHold } = useHoldConfirm(triggerEnd);

  // ─── Note input ─────────────────────────────────────────────────────────
  const submitNote = () => {
    const t = noteDraft.trim();
    if (!t) return;
    addNoteToSession(t);
    setNoteDraft("");
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const elapsed = Math.max(0, now - phaseStartedAt);
  const remainingMs = Math.max(0, POMO_MS - elapsed);
  const progress = Math.min(1, elapsed / POMO_MS);

  // Display: count is the in-progress pomodoro number; (count - 1) are
  // already banked as completed.
  const completedCount = Math.max(0, count - 1);

  return (
    <main className="flex flex-col gap-6">
      {/* Two-column layout (single column on narrow screens) */}
      <section className="grid grid-cols-1 items-center gap-8 wide:grid-cols-2 wide:gap-12">
        {/* Left: tomato + countdown */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative" style={{ width: "min(280px, 60vw)", aspectRatio: "1" }}>
            <TomatoIcon progress={progress} size="100%" />
          </div>
          <div>
            <div className="font-mono text-display leading-none tracking-tight text-ink">
              {fmtMmSs(remainingMs)}
            </div>
            <div className="smallcaps mt-2 text-ink-3">
              第 {count} 个番茄 · 进行中
            </div>
          </div>
        </div>

        {/* Right: task + notes + end */}
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TagChip tagId={session.tag} />
              <span className="mono text-xs text-ink-3">
                {session.type === "input" ? "输入型 · +1 F" : "输出型 · +0.5 F"}
              </span>
            </div>
            <h1 className="serif text-h1 leading-tight tracking-tight text-ink">
              {session.task}
            </h1>
            <div className="text-[13px] text-ink-3">
              已完成{" "}
              <span className="mono text-ink">{completedCount}</span> · 当前串累计{" "}
              <span className="mono text-ink">{completedCount * 25} min</span>
            </div>
          </header>

          {/* Notes input */}
          <div className="border-t border-rule pt-4">
            <div className="smallcaps mb-2">💭 闪过的想法</div>
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && noteDraft.trim()) submitNote();
              }}
              placeholder="写下来, 番茄结束后处理..."
              maxLength={500}
              className={cn(
                "w-full border-0 border-b border-rule bg-transparent py-2 text-[15px] leading-snug text-ink",
                "placeholder:text-ink-mute focus:border-tomato focus:outline-none",
                "focus-visible:ring-2 focus-visible:ring-tomato/30 focus-visible:rounded-sm",
                "font-kaiti"
              )}
            />
            {notes.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {notes.map((n, i) => (
                  <li
                    key={i}
                    className="font-kaiti text-[14px] leading-snug text-ink-2 before:mr-2 before:text-ink-mute before:content-['·']"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Long-press end button (with fill ring) */}
          <div className="mt-2">
            <button
              type="button"
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              className={cn(
                "relative flex h-14 w-full items-center justify-center overflow-hidden rounded-full",
                "border border-rule bg-paper text-ink-2",
                "select-none transition active:scale-[0.99]"
              )}
            >
              {/* Fill ring */}
              <div
                aria-hidden
                className="absolute inset-0 origin-left bg-tomato/20 transition-transform duration-75"
                style={{ transform: `scaleX(${holding})` }}
              />
              <div
                aria-hidden
                className="absolute inset-0 origin-left border-2 border-tomato transition-transform duration-75"
                style={{
                  transform: `scaleX(${holding})`,
                  borderRadius: "inherit",
                  // Only show the right edge as a "filling" line via clip
                  clipPath: "inset(0 0 0 0)",
                  pointerEvents: "none",
                }}
              />
              <span className="relative z-10 text-sm font-medium tracking-wider text-ink-2">
                {holding > 0.05 ? "再长按一会儿..." : "长按结束这一串"}
              </span>
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-mute">
              番茄 25 分钟自动续约 · 长按 1.5 秒结束当前串
            </p>
          </div>
        </div>
      </section>

      {/* End-flow overlay — long-press end is a deliberate cut-off, no confetti */}
      <PomodoroEndSheet
        open={showEndSheet}
        expected={session.task}
        elapsedMs={endElapsedMs}
        count={count}
        onOpenChange={(v) => {
          // Closing the sheet without an explicit decision = cancel.
          // The pomodoro keeps running; the user can long-press again.
          if (!v) setShowEndSheet(false);
        }}
        onConfirm={handleEndFeedbackConfirm}
      />
      <NotesSheet
        open={showNotesSheet}
        onOpenChange={(v) => {
          if (!v && showNotesSheet) {
            // Treat closing as "skip review" — keep notes raw in inbox
            handleNotesConfirm(
              pendingNotes.map((n) => ({ note: n, action: "inbox" as const }))
            );
          }
        }}
        notes={pendingNotes}
        onConfirm={handleNotesConfirm}
      />
    </main>
  );
}

function PomodoroEndSheet({
  open,
  expected,
  elapsedMs,
  count,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  expected: string;
  elapsedMs: number;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { awardCount: number; result: string }) => void;
}) {
  const isLong = elapsedMs >= KEEP_THRESHOLD_MS;
  const [result, setResult] = useState(expected);

  useEffect(() => {
    if (!open) return;
    setResult(expected);
  }, [open, expected]);

  const trimmedResult = result.trim();
  const completedSoFar = Math.max(0, count - 1);

  const discard = () =>
    onConfirm({ awardCount: completedSoFar, result: "" });

  const keep = () => {
    if (!trimmedResult) return; // 长路径下"按完整算"必须填原因
    onConfirm({ awardCount: count, result: trimmedResult });
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="提前结束这一串"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3">
          <div>
            <div className="smallcaps mb-1">已完成</div>
            <div className="serif text-h3 leading-none text-ink">
              {completedSoFar}
              <span className="ml-1 text-[13px] text-ink-3">个</span>
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="smallcaps mb-1">第 {count} 个进行了</div>
            <div className="font-mono text-h3 leading-none text-ink">
              {fmtMmSs(elapsedMs)}
            </div>
          </div>
        </div>

        {isLong ? (
          <>
            <p className="font-kaiti text-[14px] leading-relaxed text-ink-2">
              超过 13 分钟。可填入这段时间的产出，按完整番茄计入；也可销毁。
            </p>
            <div>
              <div className="smallcaps mb-2">这段时间做了什么</div>
              <input
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder={expected}
                className={cn(
                  "w-full border-0 border-b border-rule bg-transparent px-0 py-2",
                  "font-kaiti text-[16px] text-ink focus:border-tomato focus:outline-none",
                )}
                autoFocus
              />
              {!trimmedResult && (
                <p className="mt-1.5 text-[11px] text-ink-mute">
                  必填 · 填了才能按完整算
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-rule pt-5">
              <button
                type="button"
                onClick={discard}
                className="min-h-10 rounded-full border border-rule px-4 text-sm text-ink-2 hover:border-ink/30 hover:text-ink"
              >
                销毁第 {count} 个
              </button>
              <button
                type="button"
                onClick={keep}
                disabled={!trimmedResult}
                className={cn(
                  "min-h-10 rounded-full bg-ink px-5 text-sm font-medium text-paper",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                按完整算 · {count} 个
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="font-kaiti text-[14px] leading-relaxed text-ink-2">
              不到 13 分钟，第 {count} 个番茄会销毁。
              {completedSoFar > 0
                ? `已完成的 ${completedSoFar} 个仍计入。`
                : "这一串不计入任何番茄。"}
            </p>
            <div className="flex justify-end gap-2 border-t border-rule pt-5">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-h-10 rounded-full px-4 text-sm text-ink-3 hover:text-ink"
              >
                继续这个番茄
              </button>
              <button
                type="button"
                onClick={discard}
                className="min-h-10 rounded-full bg-ink px-5 text-sm font-medium text-paper"
              >
                销毁并结束
              </button>
            </div>
          </>
        )}
      </div>
    </ResponsiveSheet>
  );
}

// Local TagChip — kept inline to avoid an extra component file.
// If we end up needing it in 3+ places we'll extract to components/tag-chip.tsx.
function TagChip({ tagId }: { tagId: string }) {
  const tone = TAG_TONE[tagId];
  if (!tone) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight",
        "font-mono",
        tone.bg,
        tone.text
      )}
    >
      {TAG_LABEL[tagId] ?? tagId}
    </span>
  );
}
