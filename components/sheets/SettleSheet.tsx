"use client";

/**
 * SettleSheet — 每日结算（昨日回顾 + H + 熬夜）多步 stepper。
 *
 * 4 个 step：
 *   1. 昨日回顾          — 读 pomodoroHistory 里 yesterdayKey 的 #math 番茄，
 *                          用 count-up + 阶梯点亮做动画（已实时入账，纯回顾）；
 *                          底部一个背单词 toggle（番茄追踪不到的唯一 F 项）
 *   2. H · 健康自控      — 6 项 grid toggle，每项 +0.5 H
 *   3. 熬夜申报          — slider 0-6h；超出今日健康分的部分被封顶
 *   4. 总结              — 显示 derived F / H / 净额，一键确认
 *
 * 经济：
 *   F gain = 背单词(0.5)
 *   H raw  = sum(checks) * 0.5
 *   H gain = max(0, H raw − overnightH * 2)   ← 不再为负，结算无阻力
 *
 * 设计调性：
 *   - F 部分 tomato accent / H 部分 sage / 熬夜 plum
 *   - 步骤 progress dots 顶部
 *   - toggle 按钮选中态用 col-soft 背景 + col 文字
 *   - 总计大字仅在 step 4（情感峰值），日常 step 内字号克制
 *   - prefers-reduced-motion: reduce 下动画退化为静态终态
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { useStore, yesterdayKey } from "@/lib/store";
import { enumerateTiers } from "@/lib/bonus";
import { TAG_BG_CLASSES, TAG_CHIP_CLASSES } from "@/lib/tag-colors";
import type { BonusConfig, TagConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SettleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 首次结算 vs 日常 — 仅影响标题副文。 */
  isFirstTime?: boolean;
  onConfirm: (data: { fGained: number; hGained: number }) => void;
}

type Step = 1 | 2 | 3 | 4;

type HItemId =
  | "exercise"
  | "exerciseLong"
  | "sleep8"
  | "earlyBed"
  | "noSnack"
  | "healthyDiet";

interface HItem {
  id: HItemId;
  label: string;
  hint?: string;
}

const H_ITEMS: HItem[] = [
  { id: "exercise", label: "进行健身" },
  { id: "exerciseLong", label: "完成 50 分钟健身" },
  { id: "sleep8", label: "睡足 8 小时" },
  { id: "earlyBed", label: "0 点前入睡" },
  { id: "noSnack", label: "未加餐" },
  { id: "healthyDiet", label: "饮食健康" },
];

const STEP_TITLES: Record<Step, { title: string; sub?: string }> = {
  1: { title: "昨日回顾" },
  2: { title: "结算 · H (健康自控)" },
  3: { title: "熬夜申报" },
  4: { title: "今日入账" },
};

export function SettleSheet({
  open,
  onOpenChange,
  isFirstTime = false,
  onConfirm,
}: SettleSheetProps) {
  const [step, setStep] = useState<Step>(1);
  const [vocab, setVocab] = useState(false);
  const [hChecks, setHChecks] = useState<Record<HItemId, boolean>>({
    exercise: false,
    exerciseLong: false,
    sleep8: false,
    earlyBed: false,
    noSnack: false,
    healthyDiet: false,
  });
  const [overnightH, setOvernightH] = useState(0);

  // Reset on (re)open. We don't reset on close so accidentally
  // bumping the sheet doesn't wipe progress mid-session.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setVocab(false);
    setHChecks({
      exercise: false,
      exerciseLong: false,
      sleep8: false,
      earlyBed: false,
      noSnack: false,
      healthyDiet: false,
    });
    setOvernightH(0);
  }, [open]);

  // Derived ledger — recomputed every render, cheap.
  const fGained = useMemo(() => (vocab ? 0.5 : 0), [vocab]);

  const hRaw = useMemo(
    () =>
      Object.values(hChecks).reduce(
        (sum, ok) => sum + (ok ? 0.5 : 0),
        0,
      ),
    [hChecks],
  );

  // Overnight reduces the day's H gain but never below 0. The settlement
  // click should always feel like pure-positive bookkeeping; staying up
  // erases the day's reward without dipping into the saved balance.
  const rawOvernightLoss = overnightH * 2;
  const effectiveOvernightLoss = Math.min(rawOvernightLoss, hRaw);
  const hGained = hRaw - effectiveOvernightLoss;

  const goNext = () =>
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const goPrev = () =>
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const handleConfirm = () => {
    onConfirm({ fGained, hGained });
    onOpenChange(false);
  };

  const titleNode = (
    <span className="font-kaiti italic">
      {STEP_TITLES[step].title}
    </span>
  );

  void isFirstTime;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={titleNode}
    >
      <div className="flex flex-col gap-6">
        <ProgressDots current={step} accent={accentForStep(step)} />

        {step === 1 && (
          <RecapStep
            open={open}
            vocab={vocab}
            setVocab={setVocab}
            fGained={fGained}
          />
        )}
        {step === 2 && (
          <HStep hChecks={hChecks} setHChecks={setHChecks} hRaw={hRaw} />
        )}
        {step === 3 && (
          <OvernightStep
            overnightH={overnightH}
            setOvernightH={setOvernightH}
            effectiveLoss={effectiveOvernightLoss}
            wouldBeLoss={rawOvernightLoss}
            cappedAtRaw={rawOvernightLoss > hRaw && hRaw > 0}
          />
        )}
        {step === 4 && (
          <SummaryStep
            fGained={fGained}
            hRaw={hRaw}
            effectiveOvernightLoss={effectiveOvernightLoss}
            hGained={hGained}
          />
        )}

        <Footer
          step={step}
          onPrev={goPrev}
          onNext={goNext}
          onConfirm={handleConfirm}
          onCancel={() => onOpenChange(false)}
        />
      </div>
    </ResponsiveSheet>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Progress dots                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

type Accent = "tomato" | "sage" | "plum" | "ink";

function accentForStep(step: Step): Accent {
  if (step === 1) return "tomato";
  if (step === 2) return "sage";
  if (step === 3) return "plum";
  return "ink";
}

function ProgressDots({
  current,
  accent,
}: {
  current: Step;
  accent: Accent;
}) {
  const fillClass: Record<Accent, string> = {
    tomato: "bg-tomato",
    sage: "bg-sage",
    plum: "bg-plum",
    ink: "bg-ink",
  };
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={current}
      aria-label="结算进度"
    >
      {[1, 2, 3, 4].map((n) => {
        const active = n === current;
        const done = n < current;
        return (
          <span
            key={n}
            aria-hidden
            className={cn(
              "rounded-full transition-all",
              active
                ? cn("h-2 w-6", fillClass[accent])
                : done
                  ? "h-2 w-2 bg-ink-3"
                  : "h-2 w-2 bg-rule",
            )}
          />
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Step 1 — 昨日回顾                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function RecapStep({
  open,
  vocab,
  setVocab,
  fGained,
}: {
  open: boolean;
  vocab: boolean;
  setVocab: (v: boolean) => void;
  fGained: number;
}) {
  // Pull yesterday's (the day being settled) data from the persisted
  // history. Math F was credited in real time inside endSession — this
  // step is purely retrospective; no new tokens are awarded here.
  const pomodoroHistory = useStore((s) => s.pomodoroHistory);
  const tags = useStore((s) => s.tags);
  const bonuses = useStore((s) => s.bonuses);
  const yKey = useMemo(() => yesterdayKey(), []);
  const yesterdays = useMemo(
    () => pomodoroHistory.filter((p) => p.dayKey === yKey),
    [pomodoroHistory, yKey],
  );
  const totalPomos = useMemo(
    () => yesterdays.reduce((sum, p) => sum + p.count, 0),
    [yesterdays],
  );
  const totalF = useMemo(
    () =>
      yesterdays.reduce((sum, p) => sum + p.fGained + p.bonusF, 0),
    [yesterdays],
  );

  const countsByTag = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of yesterdays) {
      map.set(p.tag, (map.get(p.tag) ?? 0) + p.count);
    }
    return map;
  }, [yesterdays]);

  // Render one ladder per configured bonus that earned anything yesterday.
  // Bonuses untouched yesterday stay hidden (avoids visual noise).
  const activeBonuses = useMemo(
    () =>
      bonuses
        .map((b) => {
          const count = countsByTag.get(b.tagId) ?? 0;
          const tag = tags.find((t) => t.id === b.tagId);
          return { bonus: b, count, tag };
        })
        .filter((x) => x.count > 0),
    [bonuses, countsByTag, tags],
  );

  const hasData = totalPomos > 0;
  // Animation target: total reached ladder cells across all active
  // bonuses, used to drive the staggered fill timer. We let each bonus
  // light up its own cells in sequence by computing a flat total.
  const ladderTarget = useMemo(
    () =>
      activeBonuses.reduce(
        (sum, x) => sum + Math.min(x.count, ladderMaxCells(x.bonus, x.count)),
        0,
      ),
    [activeBonuses],
  );

  // Animation state — count-up driven by rAF; each ladder cell lights up
  // in sequence. Reset on every (re)open via `open` key.
  const [animPomos, setAnimPomos] = useState(0);
  const [ladderFilled, setLadderFilled] = useState(0);
  const animRunRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    animRunRef.current += 1;
    const myRun = animRunRef.current;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!hasData || reduced) {
      setAnimPomos(totalPomos);
      setLadderFilled(ladderTarget);
      return;
    }

    setAnimPomos(0);
    setLadderFilled(0);

    const COUNT_DURATION = 600;
    const LADDER_STEP = 70;
    const start = performance.now();

    let raf = 0;
    const tick = (t: number) => {
      if (animRunRef.current !== myRun) return;
      const p = Math.min(1, (t - start) / COUNT_DURATION);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimPomos(Math.round(eased * totalPomos));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    const ladderTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= ladderTarget; i++) {
      ladderTimers.push(
        setTimeout(() => {
          if (animRunRef.current !== myRun) return;
          setLadderFilled(i);
        }, COUNT_DURATION + i * LADDER_STEP),
      );
    }

    return () => {
      cancelAnimationFrame(raf);
      ladderTimers.forEach(clearTimeout);
    };
  }, [open, hasData, totalPomos, ladderTarget]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-rule bg-paper-2/40 px-5 py-5">
        <div className="smallcaps mb-3">昨日番茄</div>

        {hasData ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="font-serif italic text-[44px] leading-none tabular-nums text-tomato">
                  {animPomos}
                </span>
                <span className="text-sm text-ink-3">个番茄</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono text-[13px] tabular-nums text-tomato-deep">
                  +{totalF.toFixed(1)} F
                </span>
                <span className="smallcaps text-ink-mute">已入账</span>
              </div>
            </div>

            {activeBonuses.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                {(() => {
                  let cellsConsumed = 0;
                  return activeBonuses.map(({ bonus, count, tag }) => {
                    const maxCells = ladderMaxCells(bonus, count);
                    const cellsForThis = Math.min(count, maxCells);
                    const litLocal = Math.max(
                      0,
                      Math.min(cellsForThis, ladderFilled - cellsConsumed),
                    );
                    cellsConsumed += cellsForThis;
                    return (
                      <BonusLadder
                        key={bonus.id}
                        bonus={bonus}
                        tag={tag}
                        count={count}
                        filled={litLocal}
                        maxCells={maxCells}
                      />
                    );
                  });
                })()}
              </div>
            )}

            <div className="mt-3 flex items-center justify-end text-[12px] text-ink-mute">
              不重复入账
            </div>
          </>
        ) : (
          <div className="py-2">
            <div className="font-serif italic text-[28px] leading-none text-ink-3">
              昨日无番茄记录
            </div>
            <p className="mt-2 text-[12px] text-ink-mute">
              新装或休息日 · 直接进下一步
            </p>
          </div>
        )}
      </div>

      {/* Vocab toggle — the one fragmentary F item the pomodoro can't track. */}
      <div>
        <div className="smallcaps mb-2.5">番茄外的产出</div>
        <button
          type="button"
          role="checkbox"
          aria-checked={vocab}
          onClick={() => setVocab(!vocab)}
          className={cn(
            "flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors",
            vocab
              ? "border-transparent bg-tomato-soft text-tomato-deep"
              : "border-rule bg-transparent text-ink-2 hover:border-ink/25",
          )}
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className={cn(
                "inline-grid h-5 w-5 place-items-center rounded-md border text-[12px] leading-none",
                vocab
                  ? "border-tomato bg-tomato text-white"
                  : "border-rule text-ink-mute",
              )}
            >
              {vocab ? "✓" : "⨯"}
            </span>
            <span className="text-[14px]">背了单词</span>
          </div>
          <span
            className={cn(
              "font-mono text-[12px] tabular-nums",
              vocab ? "text-tomato-deep" : "text-ink-mute",
            )}
          >
            +0.5 F
          </span>
        </button>
      </div>

      <div className="flex items-baseline justify-between border-t border-rule pt-4">
        <span className="smallcaps">F 本次结算</span>
        <span className="font-serif text-[24px] tabular-nums text-tomato">
          +{fGained.toFixed(1)} F
        </span>
      </div>
    </div>
  );
}

/** How many ladder cells to render for one bonus given a count. Always
 *  shows two tiers ahead of the current count so the next milestone is
 *  visible. Capped at 30 to avoid unbounded growth on extreme days. */
function ladderMaxCells(bonus: BonusConfig, count: number): number {
  const headroom = Math.max(bonus.threshold + 2 * Math.max(bonus.step, 1), count + 2);
  return Math.min(headroom, 30);
}

/** One bonus's ladder row inside the Recap step. Tag chip + count + bar
 *  with milestones marked. `filled` is animated externally so the
 *  count-up sequence lights cells across all bonuses in order. */
function BonusLadder({
  bonus,
  tag,
  count,
  filled,
  maxCells,
}: {
  bonus: BonusConfig;
  tag: TagConfig | undefined;
  count: number;
  filled: number;
  maxCells: number;
}) {
  const tiers = enumerateTiers(bonus, count);
  const milestoneSet = new Set(tiers.map((t) => t.pomos));
  const fillBg = tag ? TAG_BG_CLASSES[tag.color] : "bg-ink";
  const chipClass = tag
    ? TAG_CHIP_CLASSES[tag.color]
    : "border border-dashed border-rule text-ink-mute";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "mono inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px]",
            chipClass,
          )}
        >
          {tag?.label ?? bonus.tagId}
        </span>
        <span className="font-mono tabular-nums text-[12px] text-ink-2">
          {count} 番
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: maxCells }, (_, i) => i + 1).map((i) => {
          const isMilestone = milestoneSet.has(i);
          const lit = i <= filled;
          const wouldBeLit = i <= count;
          return (
            <div
              key={i}
              className={cn(
                "h-2 flex-1 rounded-sm transition-colors duration-300",
                lit
                  ? fillBg
                  : isMilestone
                    ? wouldBeLit
                      ? "bg-gold-soft"
                      : "bg-gold-soft/60"
                    : "bg-ink/10",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Step 2 — H                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function HStep({
  hChecks,
  setHChecks,
  hRaw,
}: {
  hChecks: Record<HItemId, boolean>;
  setHChecks: React.Dispatch<
    React.SetStateAction<Record<HItemId, boolean>>
  >;
  hRaw: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="smallcaps">勾选今日做到的项</div>
      <div className="grid grid-cols-2 gap-2">
        {H_ITEMS.map((item) => {
          const isOn = hChecks[item.id];
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={isOn}
              onClick={() =>
                setHChecks((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
              }
              className={cn(
                "flex flex-col gap-1.5 rounded-xl px-3 py-3 text-left transition-colors",
                "border",
                isOn
                  ? "border-transparent bg-sage-soft text-sage-deep"
                  : "border-rule bg-transparent text-ink-2 hover:border-ink/25",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  aria-hidden
                  className={cn(
                    "inline-grid h-5 w-5 place-items-center rounded-md border text-[12px] leading-none",
                    isOn
                      ? "border-sage bg-sage text-white"
                      : "border-rule text-ink-mute",
                  )}
                >
                  {isOn ? "✓" : "⨯"}
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    isOn ? "text-sage-deep" : "text-ink-mute",
                  )}
                >
                  +0.5 H
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] leading-tight">
                  {item.label}
                </span>
                {item.hint && (
                  <span className="smallcaps mt-0.5">
                    {item.hint}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between border-t border-rule pt-4">
        <span className="smallcaps">H 小计</span>
        <span className="font-serif text-[24px] tabular-nums text-sage-deep">
          +{hRaw.toFixed(1)} H
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Step 3 — Overnight                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function OvernightStep({
  overnightH,
  setOvernightH,
  effectiveLoss,
  wouldBeLoss,
  cappedAtRaw,
}: {
  overnightH: number;
  setOvernightH: (n: number) => void;
  effectiveLoss: number;
  wouldBeLoss: number;
  cappedAtRaw: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="smallcaps mb-1">熬夜小时数</div>

      <div
        className={cn(
          "rounded-xl border px-4 py-4 transition-colors",
          overnightH > 0
            ? "border-plum/25 bg-plum/5"
            : "border-rule bg-transparent",
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-serif text-[28px] leading-none tabular-nums text-ink">
            {overnightH}
            <span className="ml-1 font-sans text-sm text-ink-3">h</span>
          </span>
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              overnightH > 0 ? "text-plum" : "text-ink-mute",
            )}
          >
            {overnightH > 0 ? `−${effectiveLoss} H` : "—"}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={6}
          step={1}
          value={overnightH}
          onChange={(e) => setOvernightH(parseInt(e.target.value, 10))}
          aria-label="熬夜小时数"
          className="settle-slider mt-3 w-full"
          style={{ accentColor: "var(--plum)" }}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-mute">
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      </div>

      <div className="border-t border-rule pt-3 text-[12px] text-ink-3">
        每 1h <span className="font-mono text-plum">−2 H</span>
        <span className="mx-2 text-ink-mute">·</span>
        最多抵消今日 H 收益 · 不会让 H 总余额变负
        {cappedAtRaw && (
          <span className="ml-2 text-ink-mute">
            （滑到 {overnightH}h 名义 −{wouldBeLoss}，实际抵消 −{effectiveLoss}）
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Step 4 — Summary                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

function SummaryStep({
  fGained,
  hRaw,
  effectiveOvernightLoss,
  hGained,
}: {
  fGained: number;
  hRaw: number;
  effectiveOvernightLoss: number;
  hGained: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-rule bg-paper-2/40 px-6 py-6">
        <div className="smallcaps mb-3">合计入账</div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-serif italic text-[44px] leading-none tabular-nums text-tomato">
            +{fGained.toFixed(1)}
            <span className="ml-1 font-sans text-base text-ink-3">F</span>
          </span>
          <span className="text-ink-mute">·</span>
          <span className="font-serif italic text-[44px] leading-none tabular-nums text-sage-deep">
            +{hGained.toFixed(1)}
            <span className="ml-1 font-sans text-base text-ink-3">H</span>
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-2 text-[13px]">
        <Row label="F · 番茄外产出" value={`+${fGained.toFixed(1)}`} tone="tomato" />
        <Row label="H · 健康基础分" value={`+${hRaw.toFixed(1)}`} tone="sage" />
        {effectiveOvernightLoss > 0 && (
          <Row
            label="H · 熬夜抵消"
            value={`−${effectiveOvernightLoss.toFixed(1)}`}
            tone="plum"
          />
        )}
        <div className="my-1 h-px bg-rule" />
        <Row
          label="H 净入账"
          value={`+${hGained.toFixed(1)}`}
          tone="sage"
          strong
        />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone: "tomato" | "sage" | "plum";
  strong?: boolean;
}) {
  const toneClass = {
    tomato: "text-tomato",
    sage: "text-sage-deep",
    plum: "text-plum",
  }[tone];
  return (
    <div className="flex items-baseline justify-between">
      <dt className={cn("text-ink-2", strong && "text-ink")}>{label}</dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          toneClass,
          strong ? "text-base" : "text-sm",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Footer                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function Footer({
  step,
  onPrev,
  onNext,
  onConfirm,
  onCancel,
}: {
  step: Step;
  onPrev: () => void;
  onNext: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isFirst = step === 1;
  const isLast = step === 4;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-rule pt-5">
      <button
        type="button"
        onClick={isFirst ? onCancel : onPrev}
        className={cn(
          "inline-flex min-h-10 items-center rounded-full px-4",
          "text-sm text-ink-3 hover:text-ink",
          "transition-colors",
        )}
      >
        {isFirst ? "取消" : "上一步"}
      </button>

      {isLast ? (
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full",
            "bg-ink px-5 text-sm font-medium text-paper",
            "hover:bg-ink-2 transition-colors",
          )}
        >
          确认结算
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full",
            "bg-tomato px-5 text-sm font-medium text-white",
            "hover:bg-tomato-deep transition-colors",
          )}
        >
          下一步
        </button>
      )}
    </div>
  );
}
