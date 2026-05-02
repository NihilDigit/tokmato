"use client";

import { useEffect, useState } from "react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";

export type Pay = "F" | "H" | "mixed";

export interface AddWishSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { name: string; price: number; pay: Pay; why: string }) => void;
}

export function AddWishSheet({ open, onOpenChange, onConfirm }: AddWishSheetProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState(100);
  const [pay, setPay] = useState<Pay>("mixed");
  const [why, setWhy] = useState("");

  useEffect(() => {
    if (open) return;
    setName("");
    setPrice(100);
    setPay("mixed");
    setWhy("");
  }, [open]);

  const valid = name.trim().length > 0 && price > 0;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm({ name: name.trim(), price, pay, why: why.trim() });
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="添加新愿望">
      <div className="flex flex-col gap-5">
        <div>
          <div className="smallcaps mb-2">名字</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="想要点什么"
            autoFocus
            className="w-full border-0 border-b border-rule bg-transparent py-2 text-[15px] text-ink placeholder:text-ink-mute focus:border-tomato focus:outline-none"
          />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="smallcaps">价格</span>
            <span className="mono text-[12px] text-ink-3 tabular-nums">¥{price}</span>
          </div>
          <input
            type="range"
            min={5}
            max={2000}
            step={5}
            value={price}
            onChange={(e) => setPrice(parseInt(e.target.value, 10))}
            aria-label="价格"
            className="block w-full cursor-pointer [accent-color:var(--tomato)]"
          />
          <div className="mono mt-2 flex justify-between text-[10px] text-ink-mute tabular-nums">
            <span>¥5</span>
            <span>¥500</span>
            <span>¥1000</span>
            <span>¥1500</span>
            <span>¥2000</span>
          </div>
          <input
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value, 10) || 0))}
            aria-label="精确价格"
            className="mono mt-3 w-32 rounded-md border border-rule bg-paper px-3 py-1.5 text-right text-sm tabular-nums text-ink focus:border-ink/40 focus:outline-none"
          />
        </div>

        <div>
          <div className="smallcaps mb-2">怎么付</div>
          <div className="grid grid-cols-3 gap-2">
            <PayButton active={pay === "F"} onClick={() => setPay("F")} label="FToken" tone="tomato" />
            <PayButton active={pay === "H"} onClick={() => setPay("H")} label="HToken" tone="sage" />
            <PayButton active={pay === "mixed"} onClick={() => setPay("mixed")} label="混合" tone="gold" />
          </div>
        </div>

        <div>
          <div className="smallcaps mb-2">为什么想要</div>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="（选填）说服未来的自己花这笔钱"
            rows={3}
            className="w-full resize-none rounded-lg border border-rule bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-ink-mute focus:border-ink/40 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3">
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
            disabled={!valid}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper",
              "shadow-soft transition hover:bg-ink-2",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink"
            )}
          >
            添加
          </button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function PayButton({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone: "tomato" | "sage" | "gold";
}) {
  const bg = tone === "tomato" ? "bg-tomato" : tone === "sage" ? "bg-sage" : "bg-gold";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-center text-[13px] font-medium transition",
        active ? cn(bg, "border-transparent text-white") : "border-rule bg-transparent text-ink hover:border-ink-mute/60"
      )}
    >
      {label}
    </button>
  );
}
