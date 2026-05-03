"use client";

/**
 * RunningView — Home tab's running-pomodoro state.
 *
 * Clock-based: countdown is computed every tick from
 * `Date.now() - session.phaseStartedAt`, never decremented from local
 * state. So if the tab is throttled or briefly closed and reopened,
 * the displayed time stays correct and crossed phase boundaries are
 * caught up by `advancePomodoroPhase()`.
 *
 * Notification API: best-effort permission request on first mount of
 * an active session; fires a desktop notification on each phase
 * boundary so a backgrounded user is alerted. (Service-worker / Web
 * Push for fully-closed-tab alerts is out of scope for v1.4.)
 */

import { useEffect, useRef, useState } from "react";
import { TomatoIcon } from "@/components/animations/TomatoIcon";
import { NotesSheet } from "@/components/sheets/NotesSheet";
import { useStore } from "@/lib/store";
import { startPushChain } from "@/app/actions/push";
import { setActiveSession } from "@/app/actions/active-session";
import { cn } from "@/lib/utils";
import type { PomodoroSession, KanbanColumnId } from "@/lib/types";

const POMO_MS = 25 * 60 * 1000;
const BUFFER_MS = 60 * 1000;
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
    completedCount: number
  ) => void;
}

export function RunningView({ session, onEnd }: RunningViewProps) {
  const advancePhase = useStore((s) => s.advancePomodoroPhase);

  const { mode, count, phaseStartedAt } = session;
  const phaseDuration = mode === "running" ? POMO_MS : BUFFER_MS;

  // Wall-clock tick — single source of truth for displayed time.
  const [now, setNow] = useState(() => Date.now());

  // Notes typed during this string of pomodoros
  const [notes, setNotes] = useState<string[]>(session.notes ?? []);
  const [noteDraft, setNoteDraft] = useState("");

  // Long-press end progress (0..1)
  const [holding, setHolding] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // End flow state
  const [showNotesSheet, setShowNotesSheet] = useState(false);
  const [pendingNotes, setPendingNotes] = useState<string[]>([]);

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

  // ─── Wall-clock tick + visibility resync ───────────────────────────────
  useEffect(() => {
    if (showNotesSheet) return; // pause during end flow
    const sync = () => setNow(Date.now());
    sync();
    const id = setInterval(sync, 250);
    const onVisible = () => sync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [showNotesSheet]);

  // ─── Auto-advance + notify when phase boundary crosses ─────────────────
  useEffect(() => {
    if (showNotesSheet) return;
    const elapsed = now - phaseStartedAt;
    if (elapsed < phaseDuration) return;
    const boundaryAt = phaseStartedAt + phaseDuration;
    if (lastNotifiedBoundaryRef.current !== boundaryAt) {
      lastNotifiedBoundaryRef.current = boundaryAt;
      if (mode === "running") {
        fireNotification("番茄完成", "进入 1 分钟缓冲");
      } else {
        fireNotification("缓冲结束", `第 ${count + 1} 个番茄开始`);
      }
    }
    advancePhase({ now });
  }, [now, mode, count, phaseStartedAt, phaseDuration, advancePhase, showNotesSheet]);

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
  const elapsed = Math.max(0, now - phaseStartedAt);
  const remainingMs = Math.max(0, phaseDuration - elapsed);
  const progress = Math.min(1, elapsed / phaseDuration);

  // Active session count display: in running mode we're working on the nth,
  // in buffer mode the nth was just completed.
  const completedCount = isBuffer ? count : count - 1;

  return (
    <main className="flex flex-col gap-6">
      {/* Buffer full-screen overlay (replaces the legacy thin top banner) */}
      {isBuffer && (
        <BufferOverlay
          remainingMs={remainingMs}
          completedCount={count}
          onContinue={() => {
            advancePhase({ manual: true });
            // The local `now` we have here is up to 250ms stale;
            // re-read from the store so the server-scheduled boundary
            // matches what the local timer will display.
            const fresh = useStore.getState().session;
            if (fresh) {
              void startPushChain({
                sessionId: String(fresh.phaseStartedAt),
                boundaryAt: fresh.phaseStartedAt + POMO_MS,
                kind: "running-end",
                count: fresh.count,
              }).catch(() => {});
              // Refresh the cross-device marker — manual skip changes
              // both phaseStartedAt and count, so the other device
              // would otherwise show stale numbers until the next
              // poll-tick (or until /api/push/fire's natural advance).
              void setActiveSession({
                task: fresh.task,
                tag: fresh.tag,
                type: fresh.type,
                startedAt: fresh.startedAt,
                phaseStartedAt: fresh.phaseStartedAt,
                mode: fresh.mode,
                count: fresh.count,
              }).catch(() => {});
            }
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
              {fmtMmSs(remainingMs)}
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
  remainingMs,
  completedCount,
  onContinue,
  onEnd,
}: {
  remainingMs: number;
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
          {fmtMmSs(remainingMs)}
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
