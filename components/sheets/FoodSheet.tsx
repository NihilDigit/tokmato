"use client";

/**
 * FoodSheet — 吃点好的（H 扣食物饮料消费）。
 *
 * 双 tab：
 *   常用：可编辑/可添加列表，点 item 直接扣 + close。
 *         右上角"编辑"切到编辑模式（改名/改价/删除/添加）。
 *   外卖/外食：一次性、数额不定的 — 自定义名 + slider 价格。
 *
 * 防暴食经济模型：食物饮料只能用 H，且 1 H = ¥5。
 * Wishlist 兑现里的 H 仍是 1 H = ¥10。
 */

import { useState, useEffect } from "react";
import { Coffee, Pencil, Trash2, Check, Plus } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

const FOOD_H_RATE = 5;
const PRICE_TO_H = (price: number) => Math.round((price / FOOD_H_RATE) * 100) / 100;
const fmtH = (h: number) =>
  h % 1 === 0 ? h.toFixed(0) : h.toFixed(h < 1 ? 2 : 1);

type Tab = "preset" | "custom";

export interface FoodSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  htoken: number;
  onConfirm: (data: { name: string; price: number; hSpent: number }) => void;
}

export function FoodSheet({
  open,
  onOpenChange,
  htoken,
  onConfirm,
}: FoodSheetProps) {
  const presets = useStore((s) => s.foodPresets);
  const addPreset = useStore((s) => s.addFoodPreset);
  const updatePreset = useStore((s) => s.updateFoodPreset);
  const removePreset = useStore((s) => s.removeFoodPreset);

  const [tab, setTab] = useState<Tab>("preset");
  const [editing, setEditing] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState(20);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Reset on each open (don't reset editing during use)
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setConfirming(null);
    }
  }, [open]);

  const customH = PRICE_TO_H(customPrice);
  const customAffordable = customH <= htoken && customName.trim().length > 0;

  const handlePresetTap = (id: string, name: string, price: number) => {
    if (editing) return;
    const hSpent = PRICE_TO_H(price);
    if (hSpent > htoken) return;
    setConfirming(id);
    setTimeout(() => {
      onConfirm({ name, price, hSpent });
      onOpenChange(false);
    }, 500);
  };

  const handleCustomConfirm = () => {
    if (!customAffordable) return;
    onConfirm({
      name: customName.trim(),
      price: customPrice,
      hSpent: customH,
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={
      <span className="inline-flex items-baseline gap-2">
        <Coffee size={18} className="translate-y-[2px] text-sage" aria-hidden />
        吃点好的
      </span>
    }>
      {/* Pool readout */}
      <div className="flex items-baseline justify-between border-b border-rule pb-4">
        <span className="smallcaps">HToken</span>
        <span className="flex flex-col items-end gap-1">
          <span className="mono text-balance-num text-sage tabular-nums">
            {htoken}
            <span className="ml-1 text-sm font-normal text-ink-3">H</span>
          </span>
          <span className="mono text-[11px] text-ink-3">
            食物 ¥{Math.floor(htoken * FOOD_H_RATE)}
          </span>
        </span>
      </div>

      {/* Tab segmented + edit toggle */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="食物模式"
          className="inline-flex gap-1 rounded-full border border-rule bg-paper-2/60 p-1"
        >
          <TabButton active={tab === "preset"} onClick={() => setTab("preset")}>
            常用
          </TabButton>
          <TabButton active={tab === "custom"} onClick={() => setTab("custom")}>
            外卖 / 外食
          </TabButton>
        </div>
        {tab === "preset" && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition",
              editing
                ? "border-ink bg-ink text-paper"
                : "border-rule text-ink-3 hover:border-ink/30 hover:text-ink"
            )}
          >
            {editing ? <Check size={13} /> : <Pencil size={13} />}
            {editing ? "完成" : "编辑"}
          </button>
        )}
      </div>

      {/* Preset list */}
      {tab === "preset" && (
        <div className="mt-5">
          {presets.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">
              还没有常用项，点&ldquo;编辑&rdquo;添加
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5">
              {presets.map((p) => (
                <PresetItem
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  price={p.price}
                  htoken={htoken}
                  editing={editing}
                  confirming={confirming === p.id}
                  onTap={handlePresetTap}
                  onUpdate={updatePreset}
                  onRemove={removePreset}
                />
              ))}
              {editing && <AddPresetButton onAdd={addPreset} />}
            </ul>
          )}
        </div>
      )}

      {/* Custom — slider for one-off ¥-amount items */}
      {tab === "custom" && (
        <div className="mt-5 flex flex-col gap-5">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="今天点的什么？"
            className={cn(
              "w-full border-0 border-b border-rule bg-transparent py-2 text-[15px] leading-snug text-ink",
              "placeholder:text-ink-mute focus:border-sage focus:outline-none"
            )}
          />

          <div>
            <div className="flex items-baseline justify-between">
              <span className="smallcaps">价格</span>
              <span className="mono text-[12px] text-ink-3 tabular-nums">
                ≈ {fmtH(customH)} H
              </span>
            </div>
            <div className="mt-2 mb-2 text-center">
              <div className="mono text-h2 leading-none text-ink tabular-nums">
                ¥{customPrice}
              </div>
            </div>
            <input
              type="range"
              min={1}
              max={200}
              step={1}
              value={customPrice}
              onChange={(e) => setCustomPrice(parseInt(e.target.value, 10))}
              aria-label="价格 ¥"
              className="block w-full cursor-pointer [accent-color:var(--sage)]"
            />
            <div className="mono mt-2 flex justify-between text-[10px] text-ink-mute tabular-nums">
              <span>¥1</span>
              <span>¥50</span>
              <span>¥100</span>
              <span>¥150</span>
              <span>¥200</span>
            </div>
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
              onClick={handleCustomConfirm}
              disabled={!customAffordable}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full bg-sage px-5 py-2.5 text-sm font-medium text-white",
                "shadow-soft transition hover:bg-sage-deep",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-sage"
              )}
            >
              扣 {fmtH(customH)} H
            </button>
          </div>
        </div>
      )}
    </ResponsiveSheet>
  );
}

/* ──────────── Internal ──────────── */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium transition",
        active ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function PresetItem({
  id,
  name,
  price,
  htoken,
  editing,
  confirming,
  onTap,
  onUpdate,
  onRemove,
}: {
  id: string;
  name: string;
  price: number;
  htoken: number;
  editing: boolean;
  confirming: boolean;
  onTap: (id: string, name: string, price: number) => void;
  onUpdate: (id: string, patch: { name?: string; price?: number }) => void;
  onRemove: (id: string) => void;
}) {
  const hSpent = PRICE_TO_H(price);
  const overBudget = hSpent > htoken;

  if (editing) {
    return (
      <li className="flex items-center gap-2 rounded-xl border border-rule bg-paper px-3 py-2.5">
        <input
          type="text"
          value={name}
          onChange={(e) => onUpdate(id, { name: e.target.value })}
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink focus:outline-none"
          aria-label="名称"
        />
        <span className="text-ink-3">¥</span>
        <input
          type="number"
          value={price}
          onChange={(e) =>
            onUpdate(id, { price: Math.max(0, parseFloat(e.target.value) || 0) })
          }
          step="0.5"
          className="mono w-14 border-0 bg-transparent text-right text-[14px] tabular-nums text-ink focus:outline-none"
          aria-label="价格"
        />
        <button
          type="button"
          onClick={() => onRemove(id)}
          aria-label="删除"
          className="text-ink-mute transition hover:text-plum"
        >
          <Trash2 size={14} />
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        disabled={overBudget || confirming}
        onClick={() => onTap(id, name, price)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition",
          confirming
            ? "scale-[1.02] border-tomato/30 bg-tomato/15"
            : overBudget
              ? "cursor-not-allowed border-rule bg-paper opacity-50"
              : "border-rule bg-paper hover:border-sage/40 hover:bg-sage-soft/20"
        )}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="serif text-[15px] leading-tight text-ink">{name}</span>
          <span className="mono text-[11px] text-ink-3 tabular-nums">
            ¥{price} · {fmtH(hSpent)} H
          </span>
        </div>
      </button>
    </li>
  );
}

function AddPresetButton({
  onAdd,
}: {
  onAdd: (preset: { name: string; price: number }) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onAdd({ name: "新项", price: 5 })}
        className="flex h-full w-full min-h-[60px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-rule px-4 py-3 text-[13px] text-ink-3 transition hover:border-sage/40 hover:text-sage-deep"
      >
        <Plus size={14} />
        添加
      </button>
    </li>
  );
}
