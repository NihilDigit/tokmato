"use client";

/**
 * RunningView — Home tab's running-pomodoro state.
 *
 * State machine:
 *   running (25 min countdown)
 *     ├── timer reaches 0 → buffer (60s) (auto-continue)
 *     ├── user long-presses "结束" → ends session
 *     │     → confetti animation
 *     │       → NotesSheet (if notes.length > 0)
 *     │         → onEnd(noteAssignments)
 *     │       → onEnd([]) (no notes)
 *     └── user types in "闪过的想法" input + Enter → adds to notes[]
 *   buffer
 *     ├── user clicks "继续" or timer reaches 0 → next pomodoro starts
 *     └── user clicks "结束" → same as long-press end above
 */

import { useEffect, useRef, useState } from "react";
import { TomatoIcon } from "@/components/animations/TomatoIcon";
import { NotesSheet } from "@/components/sheets/NotesSheet";
import { cn } from "@/lib/utils";
import type { PomodoroSession, KanbanColumnId } from "@/lib/types";

type Mode = "running" | "buffer";

const POMO_SECONDS = 25 * 60;
const BUFFER_SECONDS = 60;
const HOLD_MS = 1500;

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

function fmtMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export interface RunningViewProps {
  session: PomodoroSession;
  /** Called when the session is fully resolved (after notes review).
   *  `assignments` maps each note to a kanban column or "delete". */
  onEnd: (
    assignments: { note: string; action: KanbanColumnId | "delete" }[],
    completedCount: number
  ) => void;
}

export function RunningView({ session, onEnd }: RunningViewProps) {
  const [mode, setMode] = useState<Mode>("running");
  const [secondsLeft, setSecondsLeft] = useState(POMO_SECONDS);
  const [bufferLeft, setBufferLeft] = useState(BUFFER_SECONDS);
  const [count, setCount] = useState(session.count);

  // Notes typed during this string of pomodoros
  const [notes, setNotes] = useState<string[]>(session.notes ?? []);
  const [noteDraft, setNoteDraft] = useState("");

  // Long-press end progress (0..1)
  const [holding, setHolding] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // End flow state
  const [showNotesSheet, setShowNotesSheet] = useState(false);
  const [pendingNotes, setPendingNotes] = useState<string[]>([]);

  // ─── Timer effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (showNotesSheet) return; // pause during end flow
    const tick = setInterval(() => {
      if (mode === "running") {
        setSecondsLeft((s) => {
          if (s <= 1) {
            setMode("buffer");
            setBufferLeft(BUFFER_SECONDS);
            // Notification (best-effort, no permission prompt)
            try {
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("番茄完成", { body: "进入 1 分钟缓冲" });
              }
            } catch {}
            return POMO_SECONDS;
          }
          return s - 1;
        });
      } else {
        setBufferLeft((s) => {
          if (s <= 1) {
            // Auto-continue next pomodoro
            setMode("running");
            setCount((c) => c + 1);
            setSecondsLeft(POMO_SECONDS);
            return BUFFER_SECONDS;
          }
          return s - 1;
        });
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [mode, showNotesSheet]);

  // ─── Long-press end flow ────────────────────────────────────────────────
  const startHold = () => {
    setHolding(0);
    const start = Date.now();
    holdTimerRef.current = setInterval(() => {
      const t = (Date.now() - start) / HOLD_MS;
      if (t >= 1) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        setHolding(1);
        triggerEnd();
      } else {
        setHolding(t);
      }
    }, 16);
  };
  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(0);
  };
  useEffect(() => () => cancelHold(), []);

  // Long-press end is a *deliberate cut-off*, not a celebration —
  // skip confetti and go straight to notes review (or end if empty).
  const triggerEnd = () => {
    const finalNotes = noteDraft.trim()
      ? [...notes, noteDraft.trim()]
      : notes;
    const awardCount = mode === "buffer" ? count : Math.max(0, count - 1);
    setPendingNotes(finalNotes);
    if (finalNotes.length === 0) {
      onEnd([], awardCount);
    } else {
      setShowNotesSheet(true);
    }
  };

  const handleNotesConfirm = (assignments: { note: string; action: KanbanColumnId | "delete" }[]) => {
    setShowNotesSheet(false);
    const awardCount = mode === "buffer" ? count : Math.max(0, count - 1);
    onEnd(assignments, awardCount);
  };

  // ─── Note input ─────────────────────────────────────────────────────────
  const submitNote = () => {
    const t = noteDraft.trim();
    if (!t) return;
    setNotes((n) => [...n, t]);
    setNoteDraft("");
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const isBuffer = mode === "buffer";
  const left = isBuffer ? bufferLeft : secondsLeft;
  const total = isBuffer ? BUFFER_SECONDS : POMO_SECONDS;
  const progress = 1 - left / total;

  // Active session count display: in running mode we're working on the nth,
  // in buffer mode the nth was just completed.
  const completedCount = isBuffer ? count : count - 1;

  return (
    <main className="flex flex-col gap-6">
      {/* Buffer full-screen overlay (replaces the legacy thin top banner) */}
      {isBuffer && (
        <BufferOverlay
          bufferLeft={bufferLeft}
          completedCount={count}
          onContinue={() => {
            setMode("running");
            setCount((c) => c + 1);
            setSecondsLeft(POMO_SECONDS);
            setBufferLeft(BUFFER_SECONDS);
          }}
          onEnd={triggerEnd}
        />
      )}

      {/* Two-column layout (single column on small screens) */}
      <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
        {/* Left: tomato + countdown */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative" style={{ width: "min(280px, 60vw)", aspectRatio: "1" }}>
            <TomatoIcon progress={progress} size="100%" />
          </div>
          <div>
            <div className="font-mono text-display leading-none tracking-tight text-ink">
              {fmtMmSs(left)}
            </div>
            <div className={cn("smallcaps mt-2", isBuffer ? "text-tomato-deep" : "text-ink-3")}>
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
              className={cn(
                "w-full border-0 border-b border-rule bg-transparent py-2 text-[15px] leading-snug text-ink",
                "placeholder:text-ink-mute focus:border-tomato focus:outline-none",
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
              番茄到点会自动续杯 · 长按 1.5 秒结束当前串
            </p>
          </div>
        </div>
      </section>

      {/* End-flow overlay — long-press end is a deliberate cut-off, no confetti */}
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

// ────────────────────────────────────────────────────────────────────────────
// BufferOverlay — full-screen pause between pomodoros (replaces legacy top
// banner per phase-5 spec: "buffer banner 改全屏柔和过渡 + 中央倒计时")
// ────────────────────────────────────────────────────────────────────────────
function BufferOverlay({
  bufferLeft,
  completedCount,
  onContinue,
  onEnd,
}: {
  bufferLeft: number;
  completedCount: number;
  onContinue: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="缓冲期"
      className="fade-in fixed inset-0 z-[150] flex flex-col items-center justify-center gap-8"
      style={{
        background: "var(--buffer-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="smallcaps text-tomato-deep">
          第 {completedCount} 个番茄完成 · 缓冲中
        </div>
        <div className="font-mono text-display leading-none tracking-tight text-ink">
          {fmtMmSs(bufferLeft)}
        </div>
        <div className="font-kaiti italic max-w-[420px] px-6 text-[16px] leading-relaxed text-ink-2">
          一分钟休息。喝口水, 看看远处, 然后继续下一个 25 分钟。
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-rule bg-paper px-7 py-3 text-base font-medium text-ink-2 shadow-soft transition hover:border-ink/30 hover:text-ink"
        >
          继续下一个
        </button>
        <button
          type="button"
          onClick={onEnd}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-7 py-3 text-base font-medium text-paper shadow-soft transition hover:bg-ink-2"
        >
          结束这一串
        </button>
      </div>
    </div>
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
