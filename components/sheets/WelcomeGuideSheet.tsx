"use client";

import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";

export interface WelcomeGuideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user dismisses via the confirm button. Used by the
   *  first-run path to set the `tokmato:guide-seen` localStorage flag;
   *  the Settings re-open path passes nothing. */
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
      desktopWidthClass="sm:max-w-[600px]"
    >
      <div className="flex flex-col gap-6">
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
            note="不计入"
            items={UNMANAGED}
          />
        </div>

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
            知道了
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
