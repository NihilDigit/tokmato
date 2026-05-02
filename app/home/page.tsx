"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { StartSheet } from "@/components/sheets/StartSheet";
import { SettleSheet } from "@/components/sheets/SettleSheet";
import { RunningView } from "@/components/home/RunningView";
import { useStore, todayKey } from "@/lib/store";

export default function HomePage() {
  // Live state from store
  const session = useStore((s) => s.session);
  const ftoken = useStore((s) => s.ftoken);
  const htoken = useStore((s) => s.htoken);
  const timePool = useStore((s) => s.timePool);
  const todayPomos = useStore((s) => s.todayPomos);
  const todayMath = useStore((s) => s.todayMathPomos);
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
        }}
      />
    );
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
        <BalanceCell kicker="FToken" value={ftoken} unit="◆" hint="+3.5 今日" color="text-tomato" />
        <BalanceCell kicker="HToken" value={htoken} unit="❖" hint="+1.5 今日" color="text-sage" />
        <BalanceCell kicker="时间池" value={timePool} unit="min" hint="+30 今日" color="text-teal" />
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

      {/* Today progress — Bonus ladder only (today total is in TopBalances) */}
      <section>
        <ProgressCard
          kicker="今日 · 数学 BONUS"
          value={todayMath}
          unit="个 #math 番茄"
          hint="再做 1 个解锁 +1F bonus"
          ladder
        />
      </section>

      {/* Sheets */}
      <StartSheet
        open={openStart}
        onOpenChange={setOpenStart}
        recentTasks={recentTasks}
        initialTask={initialTask}
        onConfirm={(d) => {
          startSession(d);
          setOpenStart(false);
          // Phase 5.2 will navigate to a /home running sub-route
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

function ProgressCard({
  kicker,
  value,
  unit,
  hint,
  ladder,
}: {
  kicker: string;
  value: number;
  unit: string;
  hint?: string;
  ladder?: boolean;
}) {
  return (
    <div className="rounded-xl border border-rule bg-paper p-5">
      <div className="smallcaps mb-2">{kicker}</div>
      <div className="flex items-baseline gap-2">
        <span className="serif text-stat leading-none">{value}</span>
        <span className="text-sm text-ink-3">{unit}</span>
      </div>
      {hint && <div className="mt-3 text-[13px] leading-relaxed text-ink-2">{hint}</div>}
      {ladder && (
        <div className="mt-4 flex gap-1">
          {Array.from({ length: 11 }, (_, i) => i + 1).map((i) => {
            const isMilestone = [5, 7, 9, 11].includes(i);
            const filled = i <= value;
            return (
              <div
                key={i}
                className={`h-2 flex-1 rounded-sm ${filled ? "bg-tomato" : isMilestone ? "bg-gold-soft" : "bg-ink/10"}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
