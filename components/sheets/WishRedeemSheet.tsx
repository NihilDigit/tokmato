"use client";

/**
 * WishRedeemSheet — confirm a wishlist redemption.
 *
 * Wish.pay drives the form:
 *   - "F"      → cost is fixed: ceil(price/5) F
 *   - "H"      → cost is fixed: ceil(price/10) H
 *   - "mixed"  → user splits via slider; default 50/50 by ¥, anything that
 *                doesn't divide evenly rounds *up* (you slightly overpay,
 *                never underpay)
 *
 * On confirm calls store.redeemWish({wishId, fSpent, hSpent}) which deducts
 * tokens, removes wish from wishlist, and prepends to achievements.
 */

import { useEffect, useMemo, useState } from "react";
import { Wallet, Trash2 } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";

// 1 F = ¥5, 1 H = ¥10
const F_RATE = 5;
const H_RATE = 10;

export type Pay = "F" | "H" | "mixed";

export interface Wish {
  id: string;
  name: string;
  price: number;
  pay: Pay;
  why: string;
}

export interface WishRedeemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wish: Wish | null;
  ftoken: number;
  htoken: number;
  onConfirm: (data: { wishId: string; fSpent: number; hSpent: number }) => void;
  onRemove: (wishId: string) => void;
}

export function WishRedeemSheet({
  open,
  onOpenChange,
  wish,
  ftoken,
  htoken,
  onConfirm,
  onRemove,
}: WishRedeemSheetProps) {
  // Slider only matters for `mixed`. Value = ¥ amount paid by F (rest by H).
  const [fYuanSplit, setFYuanSplit] = useState(0);

  // Reset slider on open. Default 50/50 split.
  useEffect(() => {
    if (!open || !wish) return;
    setFYuanSplit(wish.pay === "mixed" ? Math.round(wish.price / 2) : 0);
  }, [open, wish]);

  const cost = useMemo(() => {
    if (!wish) return { fSpent: 0, hSpent: 0 };
    if (wish.pay === "F") {
      return { fSpent: Math.ceil(wish.price / F_RATE), hSpent: 0 };
    }
    if (wish.pay === "H") {
      return { fSpent: 0, hSpent: Math.ceil(wish.price / H_RATE) };
    }
    // mixed
    const fSpent = Math.ceil(fYuanSplit / F_RATE);
    const hYuan = Math.max(0, wish.price - fYuanSplit);
    const hSpent = Math.ceil(hYuan / H_RATE);
    return { fSpent, hSpent };
  }, [wish, fYuanSplit]);

  if (!wish) return null;

  const overF = cost.fSpent > ftoken;
  const overH = cost.hSpent > htoken;
  const insufficient = overF || overH;

  const handleConfirm = () => {
    if (insufficient) return;
    onConfirm({ wishId: wish.id, fSpent: cost.fSpent, hSpent: cost.hSpent });
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="兑现">
      {/* Item header */}
      <div className="border-b border-rule pb-5">
        <div className="serif italic text-h3 leading-tight text-ink">{wish.name}</div>
        <div className="mono mt-2 text-[13px] text-ink-3 tabular-nums">¥{wish.price}</div>
        {wish.why && (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{wish.why}</p>
        )}
      </div>

      {/* Cost layout */}
      <div className="mt-6 flex flex-col gap-5">
        <div className="smallcaps">这次付</div>

        {/* Cost rows */}
        <div className="flex items-stretch gap-3">
          <CostCell
            label="FToken"
            value={cost.fSpent}
            symbol="◆"
            tone="tomato"
            insufficient={overF}
            balance={ftoken}
          />
          <CostCell
            label="HToken"
            value={cost.hSpent}
            symbol="❖"
            tone="sage"
            insufficient={overH}
            balance={htoken}
          />
        </div>

        {/* Mixed-pay split slider */}
        {wish.pay === "mixed" && (
          <div className="rounded-xl border border-rule bg-paper p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="smallcaps">分配比例</span>
              <span className="mono text-[12px] text-ink-3 tabular-nums">
                F ¥{fYuanSplit} · H ¥{Math.max(0, wish.price - fYuanSplit)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={wish.price}
              step={5}
              value={fYuanSplit}
              onChange={(e) => setFYuanSplit(parseInt(e.target.value, 10))}
              aria-label="F / H 比例"
              className="block w-full cursor-pointer [accent-color:var(--tomato)]"
            />
            <div className="mono mt-2 flex justify-between text-[10px] text-ink-mute tabular-nums">
              <span>全 H</span>
              <span>全 F</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-7 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (confirm(`移除 "${wish.name}"?`)) {
              onRemove(wish.id);
              onOpenChange(false);
            }
          }}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-plum"
        >
          <Trash2 size={13} />
          移除
        </button>
        <div className="flex items-center gap-3">
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
            disabled={insufficient}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper",
              "shadow-soft transition hover:bg-ink-2",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink"
            )}
          >
            <Wallet size={14} />
            {insufficient ? "余额不足" : "兑现"}
          </button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function CostCell({
  label,
  value,
  symbol,
  tone,
  insufficient,
  balance,
}: {
  label: string;
  value: number;
  symbol: string;
  tone: "tomato" | "sage";
  insufficient: boolean;
  balance: number;
}) {
  if (value === 0) {
    return (
      <div className="flex flex-1 flex-col gap-1 rounded-xl border border-dashed border-rule bg-transparent p-4 opacity-60">
        <div className="smallcaps text-ink-mute">{label}</div>
        <div className="mono text-[18px] leading-none text-ink-mute tabular-nums">—</div>
      </div>
    );
  }
  const text = tone === "tomato" ? "text-tomato" : "text-sage";
  const bg = tone === "tomato" ? "bg-tomato-soft/40" : "bg-sage-soft/40";
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-1 rounded-xl border p-4",
        insufficient ? "border-plum/40 bg-plum/5" : `border-rule ${bg}`
      )}
    >
      <div className={`smallcaps ${insufficient ? "text-plum" : text}`}>{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("font-serif text-[28px] leading-none tabular-nums", insufficient ? "text-plum" : text)}>
          {value}
        </span>
        <span className={cn("text-sm", insufficient ? "text-plum/70" : "text-ink-3")}>{symbol}</span>
      </div>
      <div className="mono text-[11px] tabular-nums text-ink-3">
        余 {balance}
      </div>
    </div>
  );
}
