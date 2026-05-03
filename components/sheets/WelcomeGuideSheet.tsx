"use client";

/**
 * WelcomeGuideSheet — first-run intent statement.
 *
 * Two-column "系统管 / 系统不管" layout that defines tokmato's scope:
 * the token economy is built to throttle high-stimulation, easily
 * over-consumed leisure (delivery food, doomscrolling, gaming, shows);
 * low-stimulation normal life (reading, exercise, offline socializing)
 * stays outside the system on purpose — taxing it would convert healthy
 * defaults into chores.
 *
 * Triggered once per user from `providers.tsx` after first auth, and
 * re-openable from Settings → 入门指南. Idempotency lives in
 * `guideSeenUserIds` on the persisted state.
 */

import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";

export interface WelcomeGuideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user clicks the confirm button. The consumer is
   *  responsible for `markGuideSeen(userId)` if this is a first-run
   *  view; the Settings re-open path passes a no-op. */
  onConfirm?: () => void;
}

const MANAGED = ["外卖", "熬夜", "刷手机", "打游戏", "看剧"];
const UNMANAGED = ["读书", "运动", "线下社交", "正常聚餐"];

export function WelcomeGuideSheet({
  open,
  onOpenChange,
  onConfirm,
}: WelcomeGuideSheetProps) {
  const handleConfirm = () => {
    onConfirm?.();
    onOpenChange(false);
  };

  const titleNode = (
    <span className="font-kaiti italic">tokmato 是什么</span>
  );

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={titleNode}
      description="先看这一页 · 之后从设置可再次打开"
      desktopWidthClass="sm:max-w-[600px]"
    >
      <div className="flex flex-col gap-6">
        <p className="text-[14px] leading-relaxed text-ink-2">
          把娱乐换算成今日产出 · 用来约束容易上头的消遣，而不是给所有行为打分。
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Column
            kicker="系统管"
            tone="tomato"
            note="番茄换娱乐时间"
            items={MANAGED}
          />
          <Column
            kicker="系统不管"
            tone="ink"
            note="不必计入"
            items={UNMANAGED}
          />
        </div>

        <p className="text-[13px] leading-relaxed text-ink-3 border-t border-rule pt-4">
          低刺激的正常生活不需要代币管制 · 让它们留在系统外，避免把好习惯变成"任务"。
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-rule pt-5">
          <button
            type="button"
            onClick={handleConfirm}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full",
              "bg-ink px-5 text-sm font-medium text-paper",
              "hover:bg-ink-2 transition-colors",
            )}
          >
            我懂了
          </button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function Column({
  kicker,
  tone,
  note,
  items,
}: {
  kicker: string;
  tone: "tomato" | "ink";
  note: string;
  items: string[];
}) {
  const accent =
    tone === "tomato"
      ? {
          border: "border-tomato/25",
          bg: "bg-tomato-soft/30",
          kicker: "text-tomato-deep",
          item: "text-ink",
        }
      : {
          border: "border-rule",
          bg: "bg-paper-2/40",
          kicker: "text-ink-3",
          item: "text-ink-3",
        };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-4",
        accent.border,
        accent.bg,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className={cn("smallcaps", accent.kicker)}>{kicker}</span>
        <span className="text-[11px] leading-tight text-ink-mute">{note}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => (
          <li
            key={it}
            className={cn(
              "text-[14px] leading-snug",
              accent.item,
            )}
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
