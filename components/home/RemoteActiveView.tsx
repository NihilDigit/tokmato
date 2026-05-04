"use client";

/**
 * RemoteActiveView — read-only mirror shown on /home when another
 * signed-in device is mid-pomodoro. The marker writer lives at
 * `app/actions/active-session.ts`; this view just reads, ticks, and
 * renders. No actions, no Start button — naturally blocks double-fire.
 *
 * Like `RunningView`, the displayed time is derived every tick from
 * `Date.now() - phaseStartedAt`; we don't decrement a counter. The
 * server-side advance in `/api/push/fire` keeps `phaseStartedAt` /
 * `mode` / `count` fresh on each chain link even while the originator
 * tab is closed.
 */

import { useEffect, useState } from "react";
import { TomatoIcon } from "@/components/animations/TomatoIcon";
import { cn } from "@/lib/utils";
import type { ActiveSessionMarker } from "@/app/actions/active-session";

const POMO_MS = 25 * 60 * 1000;
const BUFFER_MS = 60 * 1000;

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
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RemoteActiveView({ marker }: { marker: ActiveSessionMarker }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const sync = () => setNow(Date.now());
    sync();
    const id = setInterval(sync, 250);
    const onVisible = () => sync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const phaseDuration = marker.mode === "running" ? POMO_MS : BUFFER_MS;
  const elapsed = Math.max(0, now - marker.phaseStartedAt);
  const remainingMs = Math.max(0, phaseDuration - elapsed);
  const progress = Math.min(1, elapsed / phaseDuration);
  const isBuffer = marker.mode === "buffer";

  return (
    <main className="flex flex-col gap-6">
      <section className="grid grid-cols-1 items-center gap-8 wide:grid-cols-2 wide:gap-12">
        {/* Left: muted tomato + countdown */}
        <div className="flex flex-col items-center gap-4 text-center opacity-80">
          <div className="relative" style={{ width: "min(280px, 60vw)", aspectRatio: "1" }}>
            <TomatoIcon progress={progress} size="100%" />
          </div>
          <div>
            <div className="font-mono text-display leading-none tracking-tight text-ink-2">
              {fmtMmSs(remainingMs)}
            </div>
            <div
              className={cn(
                "smallcaps mt-2",
                isBuffer ? "text-tomato-deep" : "text-ink-3",
              )}
            >
              第 {marker.count} 个番茄 · {isBuffer ? "缓冲" : "进行中"}
            </div>
          </div>
        </div>

        {/* Right: task meta + locked-out reason */}
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TagChip tag={marker.tag} />
              <span className="mono text-xs text-ink-3">
                {marker.type === "input" ? "输入型 · +1 F" : "输出型 · +0.5 F"}
              </span>
            </div>
            <h1 className="serif text-h2 leading-tight text-ink">{marker.task}</h1>
          </header>

          <div className="flex flex-col gap-3 rounded-lg border border-rule bg-paper-2/50 p-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full bg-tomato animate-pulse"
              />
              <span className="smallcaps text-ink-2">另一端正在运行</span>
            </div>
            <p className="text-sm leading-relaxed text-ink-2">
              本端只读，禁止重复启动。等对端结束后这里会自动恢复。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function TagChip({ tag }: { tag: string }) {
  const tone = TAG_TONE[tag] ?? TAG_TONE.cs;
  const label = TAG_LABEL[tag] ?? tag;
  return (
    <span
      className={cn(
        "mono inline-flex h-5 items-center rounded-full px-2 text-xs",
        tone.bg,
        tone.text,
      )}
    >
      {label}
    </span>
  );
}
