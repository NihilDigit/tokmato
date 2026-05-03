"use client";

/**
 * PoolSheet — 充值时间池。
 *
 * 默认从 FToken 扣（学习产出最直接换娱乐时间）。Toggle 切到 HToken。
 * Slider 0..余额，自定义输入框可改成任意 0.5 步进数。
 * Confirm 后播 1.5s burn ceremony 动画再 onConfirm + close。
 *
 * 经济模型：1 F = 30 min, 1 H = 30 min。
 */

import { useEffect, useRef, useState } from "react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";

const MIN_PER_TOKEN = 30;
const BURN_DURATION_MS = 1500;
const TWEEN_STEP_MS = 16;

type Token = "F" | "H";

export interface PoolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ftoken: number;
  htoken: number;
  timePool: number;
  onConfirm: (data: {
    fSpent: number;
    hSpent: number;
    minutesGained: number;
  }) => void;
}

const round05 = (n: number) => Math.round(n * 2) / 2;

export function PoolSheet({
  open,
  onOpenChange,
  ftoken,
  htoken,
  timePool,
  onConfirm,
}: PoolSheetProps) {
  const [token, setToken] = useState<Token>("F");
  const [amount, setAmount] = useState(1);
  const [burning, setBurning] = useState(false);
  const [tweenedPool, setTweenedPool] = useState(timePool);
  const burnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const balance = token === "F" ? ftoken : htoken;
  const symbol = token === "F" ? "◆" : "❖";
  const tokenAccent = token === "F" ? "text-tomato" : "text-sage";
  const tokenBg = token === "F" ? "bg-tomato" : "bg-sage";

  const minutesGained = amount * MIN_PER_TOKEN;
  const overBudget = amount > balance;
  const empty = balance < 0.5;

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setToken("F");
    setAmount(1);
    setBurning(false);
    setTweenedPool(timePool);
    return () => {
      if (burnTimerRef.current) clearInterval(burnTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [open, timePool]);

  // Snap amount when token changes (different balance)
  useEffect(() => {
    setAmount((a) => round05(Math.max(0.5, Math.min(a, balance || 0.5))));
  }, [token, balance]);

  const handleConfirm = () => {
    if (overBudget || empty || burning) return;
    setBurning(true);

    // Tween pool number from current → current + minutesGained over BURN_DURATION_MS
    const start = timePool;
    const end = timePool + minutesGained;
    const startedAt = Date.now();
    burnTimerRef.current = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / BURN_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setTweenedPool(Math.round(start + (end - start) * eased));
      if (t >= 1) {
        if (burnTimerRef.current) clearInterval(burnTimerRef.current);
      }
    }, TWEEN_STEP_MS);

    closeTimerRef.current = setTimeout(() => {
      onConfirm({
        fSpent: token === "F" ? amount : 0,
        hSpent: token === "H" ? amount : 0,
        minutesGained,
      });
      onOpenChange(false);
    }, BURN_DURATION_MS);
  };

  // Prevent closing while burn animation runs
  const handleOpenChange = (next: boolean) => {
    if (burning && !next) return;
    onOpenChange(next);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="充值时间池"
    >
      {/* Pool readout — animates during burn */}
      <div className="flex items-baseline justify-between border-b border-rule pb-4">
        <span className="smallcaps">时间池</span>
        <span className="mono text-balance-num text-teal-deep tabular-nums">
          {tweenedPool}
          <span className="ml-1 text-sm font-normal text-ink-3">min</span>
        </span>
      </div>

      {/* Token toggle */}
      <div className="mt-5">
        <div className="smallcaps mb-2">用什么换</div>
        <div className="inline-flex gap-1 rounded-full border border-rule bg-paper-2/60 p-1">
          <TokenTab active={token === "F"} onClick={() => setToken("F")}>
            <span className="text-tomato">◆</span> FToken
            <span className="mono ml-2 text-[11px] text-ink-3 tabular-nums">余 {ftoken}</span>
          </TokenTab>
          <TokenTab active={token === "H"} onClick={() => setToken("H")}>
            <span className="text-sage">❖</span> HToken
            <span className="mono ml-2 text-[11px] text-ink-3 tabular-nums">余 {htoken}</span>
          </TokenTab>
        </div>
      </div>

      {/* Big readout: amount + minutes gained */}
      <div className="mt-7 grid grid-cols-2 items-end gap-6 text-center">
        <div>
          <div className="smallcaps mb-2">扣</div>
          <div className="flex items-baseline justify-center gap-2">
            <span
              className={cn(
                "serif text-h1 leading-none tabular-nums",
                overBudget ? "text-plum" : tokenAccent
              )}
            >
              {amount}
            </span>
            <span className={cn("text-[18px]", tokenAccent)}>{symbol}</span>
          </div>
        </div>
        <div>
          <div className="smallcaps mb-2">+ 时间池</div>
          <div className="mono text-h1 leading-none text-teal-deep tabular-nums">
            +{minutesGained}
            <span className="ml-1 text-sm font-normal text-ink-3">min</span>
          </div>
        </div>
      </div>

      {/* Slider */}
      <div className="mt-6">
        <input
          type="range"
          min={0.5}
          max={Math.max(0.5, balance)}
          step={0.5}
          value={Math.min(amount, Math.max(0.5, balance))}
          onChange={(e) => setAmount(round05(parseFloat(e.target.value)))}
          disabled={empty || burning}
          aria-label="数量"
          className={cn(
            "block w-full cursor-pointer",
            token === "F" ? "[accent-color:var(--tomato)]" : "[accent-color:var(--sage)]",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        />
        <div className="mono mt-2 flex justify-between text-[10px] text-ink-mute tabular-nums">
          <span>0.5</span>
          <span>{Math.round((balance / 4) * 2) / 2}</span>
          <span>{Math.round((balance / 2) * 2) / 2}</span>
          <span>{Math.round(((balance * 3) / 4) * 2) / 2}</span>
          <span>{balance}</span>
        </div>
      </div>

      {/* Custom input — any 0.5 step */}
      <div className="mt-5 flex items-center gap-3">
        <span className="smallcaps">或精确</span>
        <input
          type="number"
          min={0.5}
          max={balance}
          step={0.5}
          value={amount}
          onChange={(e) => setAmount(round05(parseFloat(e.target.value) || 0))}
          disabled={empty || burning}
          aria-label="精确数量"
          className={cn(
            "mono w-24 rounded-md border border-rule bg-paper px-3 py-1.5 text-right text-sm tabular-nums text-ink",
            "focus:border-ink/40 focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        />
        <span className={cn("text-sm", tokenAccent)}>{symbol}</span>
      </div>

      {/* Burn ceremony glyph (only renders during burn) */}
      {burning && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`正在燃烧 ${amount} ${token}, 转换为 ${minutesGained} 分钟`}
          className="pointer-events-none mt-5 grid h-20 place-items-center"
        >
          <span
            className={cn("font-kaiti italic text-3xl", tokenAccent)}
            style={{
              animation: "tk-burn-glyph 1.5s ease-out forwards",
            }}
          >
            {amount} {symbol}
          </span>
          {/* 8 ember sparks fanning out radially */}
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * Math.PI * 2) / 8;
            const dx = Math.cos(angle) * 60;
            const dy = Math.sin(angle) * 60;
            return (
              <span
                key={i}
                aria-hidden
                className={cn("absolute h-1.5 w-1.5 rounded-full", tokenBg)}
                style={{
                  animation: `tk-burn-ember-${i} 1.5s ease-out forwards`,
                  // @ts-expect-error CSS custom properties on inline style
                  "--dx": `${dx}px`,
                  "--dy": `${dy}px`,
                }}
              />
            );
          })}
          <style>{`
            @keyframes tk-burn-glyph {
              0%   { opacity: 1; transform: scale(1); filter: blur(0); }
              60%  { opacity: 0.7; transform: scale(1.1); filter: blur(2px); }
              100% { opacity: 0; transform: scale(0.85); filter: blur(8px); }
            }
            ${Array.from({ length: 8 })
              .map((_, i) => {
                const angle = (i * Math.PI * 2) / 8;
                const dx = Math.cos(angle) * 60;
                const dy = Math.sin(angle) * 60;
                return `@keyframes tk-burn-ember-${i} {
                  0%   { opacity: 1; transform: translate(0, 0) scale(1); }
                  100% { opacity: 0; transform: translate(${dx}px, ${dy}px) scale(0.5); }
                }`;
              })
              .join("\n")}
          `}</style>
        </div>
      )}

      {/* Footer */}
      <div className="mt-7 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={burning}
          className="text-sm text-ink-3 hover:text-ink disabled:opacity-40"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={overBudget || empty || burning}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper",
            "shadow-soft transition hover:bg-ink-2",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink"
          )}
        >
          {burning ? "燃烧中..." : `换 ${minutesGained} min`}
        </button>
      </div>

      {empty && (
        <p className="mt-3 text-[12px] text-ink-3">
          {token === "F" ? "FToken" : "HToken"} 余额为 0，{token === "F" ? "去番茄页攒一会儿" : "去结算页打个 H 的卡"}
        </p>
      )}
      {overBudget && !empty && (
        <p className="mt-3 text-[12px] text-plum">
          余额不够 · 还差 {round05(amount - balance)} {symbol}
        </p>
      )}
    </ResponsiveSheet>
  );
}

function TokenTab({
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
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-4 py-1.5 text-[13px] font-medium transition",
        active ? "bg-paper text-ink shadow-soft" : "text-ink-3 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
