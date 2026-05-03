"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { StartSheet } from "@/components/sheets/StartSheet";
import { SettleSheet } from "@/components/sheets/SettleSheet";
import { RunningView } from "@/components/home/RunningView";
import { useStore, todayKey } from "@/lib/store";
import { startPushChain, cancelPushChain } from "@/app/actions/push";
import {
  setActiveSession,
  clearActiveSession,
} from "@/app/actions/active-session";
import { useActiveSession } from "@/lib/use-active-session";
import { RemoteActiveView } from "@/components/home/RemoteActiveView";
import { enumerateTiers } from "@/lib/bonus";
import { TAG_BG_CLASSES, TAG_TEXT_CLASSES } from "@/lib/tag-colors";
import type { BonusConfig, TagConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

const POMO_MS = 25 * 60 * 1000;

export default function HomePage() {
  // Live state from store
  const session = useStore((s) => s.session);
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const todayPomos = useStore((s) => s.todayPomos);
  const todayCountsByTag = useStore((s) => s.todayCountsByTag);
  const tags = useStore((s) => s.tags);
  const bonuses = useStore((s) => s.bonuses);
  const todayFGained = useStore((s) => s.todayFGained);
  const todayHGained = useStore((s) => s.todayHGained);
  const todayPoolGained = useStore((s) => s.todayPoolGained);
  const recentTasks = useStore((s) => s.recentTasks);
  const lastSettledDate = useStore((s) => s.lastSettledDate);
  const settleAction = useStore((s) => s.settle);
  const startSession = useStore((s) => s.startSession);
  const endSession = useStore((s) => s.endSession);
  const moveKanbanCard = useStore((s) => s.moveKanbanCard);
  const addKanbanCard = useStore((s) => s.addKanbanCard);

  // ─── Hook calls (must run unconditionally on every render) ─────────────
  const [openStart, setOpenStart] = useState(false);
  const [openSettle, setOpenSettle] = useState(false);
  const [initialTask, setInitialTask] = useState<string | undefined>(undefined);
  const { remoteActive } = useActiveSession();

  // void to suppress unused-when-no-session warning
  void moveKanbanCard;

  // ─── Running state — conditional render after hooks ────────────────────
  if (session) {
    return (
      <RunningView
        session={session}
        onEnd={(assignments, completedCount) => {
          for (const { note, action } of assignments) {
            if (action === "delete") continue;
            const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            addKanbanCard({ col: action, card: { id, name: note, next: "" } });
          }
          endSession({ completedCount });
          // Tear down the server-side push chain so no further
          // boundary notifications fire for the session we just ended.
          void cancelPushChain().catch(() => {});
          void clearActiveSession().catch(() => {});
        }}
      />
    );
  }

  // Another device is mid-pomodoro. Render a read-only mirror and
  // suppress the start affordance so we can't double-fire.
  if (remoteActive) {
    return <RemoteActiveView marker={remoteActive} />;
  }

  // Settle banner shows when today's settlement hasn't been done yet
  // (4am UTC+8 cutoff baked into todayKey()). SSR + first client render
  // both see the same default lastSettledDate so no hydration mismatch.
  const needsSettle = lastSettledDate !== todayKey();

  const startWith = (task?: string) => {
    setInitialTask(task);
    setOpenStart(true);
  };

  return (
    <main className="flex flex-col gap-6">
      {/* Top: balance strip — 3 columns, hairline-divided */}
      <section className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-rule bg-rule">
        <BalanceCell kicker="FToken" value={ftoken} unit="◆" hint={`${fmtSigned(todayFGained)} 今日`} color="text-tomato" />
        <BalanceCell kicker="HToken" value={htoken} unit="❖" hint={`${fmtSigned(todayHGained)} 今日`} color="text-sage" />
        <BalanceCell kicker="时间池" value={timePool} unit="min" hint={`${fmtSigned(todayPoolGained, "min")} 今日`} color="text-teal" />
      </section>

      {/* Settle banner — auto-shows once per day after 4am UTC+8 */}
      {needsSettle && (
        <button
          onClick={() => setOpenSettle(true)}
          className="flex items-center justify-between rounded-lg border border-tomato/20 bg-gradient-to-b from-gold-soft/40 to-tomato-soft/40 px-5 py-4 text-left transition hover:border-tomato/40"
        >
          <div className="flex items-center gap-4">
            <span className="text-2xl">☀</span>
            <div className="serif italic text-lg leading-snug text-ink">
              给昨天打个分
            </div>
          </div>
          <span className="text-sm font-medium text-tomato-deep">开始 →</span>
        </button>
      )}

      {/* Hero — start a tomato. h2 size, not display. */}
      <section className="rounded-xl border border-rule bg-paper-2/50 p-6 sm:p-8">
        <h1 className="serif italic text-h2 leading-tight">
          这个 25 分钟 <span className="text-tomato">我要做什么?</span>
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => startWith()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-tomato px-6 py-3 text-base font-medium text-white shadow-soft transition hover:bg-tomato-deep"
          >
            <Play size={16} fill="currentColor" />
            开始番茄
          </button>
        </div>

        {/* Recent tasks — click to pre-fill the start sheet */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="smallcaps mr-2">最近</span>
          {recentTasks.map((t) => (
            <button
              key={t}
              onClick={() => startWith(t)}
              className="rounded-full border border-rule px-3.5 py-1.5 text-[13px] text-ink-2 transition hover:border-tomato/30 hover:text-ink"
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Today progress — one Bonus ladder card per configured bonus */}
      {bonuses.length > 0 && (
        <section className="flex flex-col gap-3">
          {bonuses.map((bonus) => {
            const tag = tags.find((t) => t.id === bonus.tagId);
            const count = todayCountsByTag[bonus.tagId] ?? 0;
            return (
              <BonusProgressCard
                key={bonus.id}
                bonus={bonus}
                count={count}
                tag={tag}
              />
            );
          })}
        </section>
      )}

      {/* Sheets */}
      <StartSheet
        open={openStart}
        onOpenChange={setOpenStart}
        recentTasks={recentTasks}
        initialTask={initialTask}
        onConfirm={(d) => {
          startSession(d);
          setOpenStart(false);
          // Schedule the first phase boundary on the server so a
          // closed-browser user still gets the running-end alert.
          // The chain self-perpetuates from there. sessionId is the
          // current phaseStartedAt — manual advances rotate it,
          // invalidating any in-flight QStash callbacks.
          const fresh = useStore.getState().session;
          if (fresh) {
            void startPushChain({
              sessionId: String(fresh.phaseStartedAt),
              boundaryAt: fresh.phaseStartedAt + POMO_MS,
              kind: "running-end",
              count: fresh.count,
            }).catch(() => {});
            // Cross-device awareness — write the marker so any other
            // signed-in device shows a read-only mirror and disables
            // its start button.
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
      />
      <SettleSheet
        open={openSettle}
        onOpenChange={setOpenSettle}
        isFirstTime={!lastSettledDate}
        onConfirm={(d) => {
          settleAction(d);
          setOpenSettle(false);
        }}
      />
    </main>
  );
}

function fmtSigned(value: number, unit = "") {
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${rounded}${unit ? " " + unit : ""}`;
}

function nextBonusHint(bonus: BonusConfig, count: number): string {
  // Find the smallest unreached tier given the unbounded ladder.
  if (count < bonus.threshold) {
    const left = bonus.threshold - count;
    return `再做 ${left} 个解锁 +${bonus.initialReward} F bonus`;
  }
  if (bonus.step <= 0) return "本档已满 · 设置里加步长可继续外推";
  // count >= threshold; find next tier = threshold + n*step where n is
  // the smallest integer making the tier > count.
  const passed = Math.floor((count - bonus.threshold) / bonus.step);
  const next = bonus.threshold + (passed + 1) * bonus.step;
  const left = next - count;
  return `再做 ${left} 个解锁 +${bonus.stepReward} F bonus`;
}

function BalanceCell({
  kicker,
  value,
  unit,
  hint,
  color,
}: {
  kicker: string;
  value: number;
  unit: string;
  hint: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-paper p-5">
      <div className={`smallcaps ${color}`}>{kicker}</div>
      <div className="flex items-baseline gap-2">
        <span className="serif text-stat leading-none">{value}</span>
        <span className="text-sm text-ink-3">{unit}</span>
      </div>
      <div className="mono text-[13px] leading-snug text-ink-3">{hint}</div>
    </div>
  );
}

function BonusProgressCard({
  bonus,
  count,
  tag,
}: {
  bonus: BonusConfig;
  count: number;
  tag: TagConfig | undefined;
}) {
  const tiers = enumerateTiers(bonus, count);
  const fillBg = tag ? TAG_BG_CLASSES[tag.color] : "bg-ink";
  const labelText = tag ? TAG_TEXT_CLASSES[tag.color] : "text-ink-3";
  const tagLabel = tag?.label ?? bonus.tagId;
  // Visual ladder: cells from 1..maxCells, where maxCells covers up to
  // two tiers ahead of the current count (so the user always sees the
  // next milestone they're working toward).
  const maxCells = Math.max(
    bonus.threshold + 2 * Math.max(bonus.step, 1),
    count + 2,
  );
  const milestoneSet = new Set(tiers.map((t) => t.pomos));
  return (
    <div className="rounded-xl border border-rule bg-paper p-5">
      <div className={cn("smallcaps mb-2", labelText)}>
        今日 · {tagLabel} BONUS
      </div>
      <div className="flex items-baseline gap-2">
        <span className="serif text-stat leading-none">{count}</span>
        <span className="text-sm text-ink-3">个 {tagLabel} 番茄</span>
      </div>
      <div className="mt-3 text-[13px] leading-relaxed text-ink-2">
        {nextBonusHint(bonus, count)}
      </div>
      <div className="mt-4 flex gap-1">
        {Array.from({ length: maxCells }, (_, i) => i + 1).map((i) => {
          const isMilestone = milestoneSet.has(i);
          const filled = i <= count;
          return (
            <div
              key={i}
              className={cn(
                "h-2 flex-1 rounded-sm",
                filled
                  ? fillBg
                  : isMilestone
                    ? "bg-gold-soft"
                    : "bg-ink/10",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
