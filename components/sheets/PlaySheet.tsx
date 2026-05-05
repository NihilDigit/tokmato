"use client";

/**
 * PlaySheet — 启动一段娱乐 timer。
 *
 * 主动型最大 4h；切被动型 slider 自动缩到 2h 上限（因为实际扣是 ×2，
 * 实际"占掉"的时间池仍封顶在 4h），并显式显示倍数。
 */

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { KanbanCard, KanbanColumnId, PlayType } from "@/lib/types";

export interface PlaySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前时间池剩余分钟。Slider 上限受其约束。 */
  timePool: number;
  onConfirm: (data: {
    minutes: number;
    costMinutes: number;
    type: PlayType;
    task?: string;
    kanbanCardId?: string;
  }) => void;
}

const MIN_MINUTES = 5;
const ACTIVE_MAX = 240; // 4h
const PASSIVE_MAX = 120; // 2h (cost ×2 → still 4h pool)

const COL_LABEL: Record<KanbanColumnId, string> = {
  inbox: "Inbox",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
};

export function PlaySheet({
  open,
  onOpenChange,
  timePool,
  onConfirm,
}: PlaySheetProps) {
  const kanban = useStore((s) => s.kanban);
  const kanbanCards = (Object.entries(kanban) as [KanbanColumnId, KanbanCard[]][])
    .flatMap(([col, cards]) => cards.map((card) => ({ col, card })));
  const [type, setType] = useState<PlayType>("active");
  const [minutes, setMinutes] = useState(30);
  const [kanbanCardId, setKanbanCardId] = useState<string | undefined>(undefined);

  const typeMax = type === "active" ? ACTIVE_MAX : PASSIVE_MAX;
  const sliderMax = Math.max(MIN_MINUTES, Math.min(typeMax, costAvail(type, timePool)));
  const cost = type === "passive" ? minutes * 2 : minutes;
  const overBudget = cost > timePool;
  const poolEmpty = timePool < MIN_MINUTES;

  // When type changes, snap minutes back to range
  useEffect(() => {
    setMinutes((m) => Math.max(MIN_MINUTES, Math.min(m, typeMax)));
  }, [typeMax]);

  // When sheet (re)opens, also snap to current pool ceiling
  useEffect(() => {
    if (!open) return;
    setMinutes((m) => Math.max(MIN_MINUTES, Math.min(m, sliderMax)));
    setKanbanCardId(undefined);
  }, [open, sliderMax]);

  const handleConfirm = () => {
    if (overBudget || poolEmpty) return;
    const card = kanbanCards.find((item) => item.card.id === kanbanCardId)?.card;
    onConfirm({
      minutes,
      costMinutes: cost,
      type,
      ...(card ? { task: card.name, kanbanCardId: card.id } : {}),
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="玩点什么">
      {/* Pool readout */}
      <div className="flex items-baseline justify-between border-b border-rule pb-4">
        <span className="smallcaps">时间池</span>
        <span className="mono text-balance-num text-teal-deep tabular-nums">
          {timePool}
          <span className="ml-1 text-sm font-normal text-ink-3">min</span>
        </span>
      </div>

      {/* Big readout — shows multiplication for passive */}
      <div className="pt-7 pb-3 text-center">
        <div
          className={cn(
            "mono leading-none tabular-nums",
            overBudget ? "text-plum" : "text-ink",
            type === "passive" ? "text-h2" : "text-display"
          )}
        >
          {type === "passive" ? (
            <>
              <span>{minutes}</span>
              <span className="px-2 text-ink-mute">×</span>
              <span>2</span>
              <span className="px-2 text-ink-mute">=</span>
              <span>{cost}</span>
            </>
          ) : (
            <>{minutes}</>
          )}
        </div>
        <div className="smallcaps mt-3">
          {type === "passive" ? "实扣分钟" : "分钟"}
        </div>
      </div>

      {/* Slider — bounds shift with type */}
      <div className="mt-2">
        <input
          type="range"
          min={MIN_MINUTES}
          max={sliderMax}
          step={1}
          value={minutes}
          onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
          disabled={poolEmpty}
          aria-label="娱乐时长（分钟）"
          className={cn(
            "block w-full cursor-pointer",
            "[accent-color:var(--teal)]",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        />
        <div className="mono mt-2 flex justify-between text-[11px] text-ink-mute tabular-nums">
          <span>{MIN_MINUTES}</span>
          <span>{Math.round(typeMax / 4)}</span>
          <span>{Math.round(typeMax / 2)}</span>
          <span>{Math.round((typeMax * 3) / 4)}</span>
          <span>{typeMax}</span>
        </div>
      </div>

      {/* Type — 主动型 / 被动型 */}
      <div className="mt-7">
        <div className="smallcaps mb-3">类型</div>
        <div className="grid grid-cols-2 gap-2.5">
          <TypeButton
            active={type === "active"}
            onClick={() => setType("active")}
            label="主动型"
            tone="sage"
          />
          <TypeButton
            active={type === "passive"}
            onClick={() => setType("passive")}
            label="被动型"
            tone="plum"
          />
        </div>
      </div>

      {kanbanCards.length > 0 && (
        <div className="mt-7">
          <div className="smallcaps mb-3">绑定 Kanban</div>
          <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setKanbanCardId(undefined)}
              className={cn(
                "flex min-h-9 items-center justify-between rounded-lg border px-3 text-left text-[13px] transition",
                kanbanCardId === undefined
                  ? "border-ink bg-ink/4 text-ink"
                  : "border-rule text-ink-3 hover:border-ink/30 hover:text-ink"
              )}
            >
              不绑定
            </button>
            {kanbanCards.map(({ col, card }) => {
              const selected = kanbanCardId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setKanbanCardId(card.id)}
                  className={cn(
                    "flex min-h-10 items-center justify-between gap-3 rounded-lg border px-3 text-left transition",
                    selected
                      ? "border-teal bg-teal/10 text-ink"
                      : "border-rule text-ink-2 hover:border-teal/30"
                  )}
                >
                  <span className="min-w-0 truncate text-[13px]">{card.name}</span>
                  <span className="mono shrink-0 text-[11px] text-ink-mute">
                    {COL_LABEL[col]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm */}
      <div className="mt-7 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="text-sm text-ink-3 hover:text-ink"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={overBudget || poolEmpty}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full bg-tomato px-5 py-2.5 text-sm font-medium text-white",
            "shadow-soft transition hover:bg-tomato-deep",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-tomato"
          )}
        >
          <Play size={14} fill="currentColor" />
          启动 {minutes} 分钟
        </button>
      </div>

      {poolEmpty && (
        <p className="mt-3 text-[12px] text-ink-3">
          时间池空了，先去番茄页攒一会儿
        </p>
      )}
      {overBudget && !poolEmpty && (
        <p className="mt-3 text-[12px] text-plum">
          时间池不够 · 还差 {cost - timePool} min
        </p>
      )}
    </ResponsiveSheet>
  );
}

/** Slider needs to also respect the pool: for passive, max minutes
 *  before the ×2 cost exceeds the pool is `floor(timePool / 2)`. */
function costAvail(type: PlayType, timePool: number): number {
  return type === "passive" ? Math.floor(timePool / 2) : timePool;
}

type Tone = "sage" | "plum";

function TypeButton({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone: Tone;
}) {
  const activeBg = tone === "sage" ? "bg-sage" : "bg-plum";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-4 py-3.5 text-center transition",
        active
          ? cn(activeBg, "border-transparent text-white")
          : "border-rule bg-transparent text-ink hover:border-ink-mute/60"
      )}
    >
      <span className="serif italic text-lg leading-none">{label}</span>
    </button>
  );
}
