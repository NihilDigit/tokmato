"use client";

/**
 * SettleSheet — 每日结算（F + H + 熬夜）多步 stepper。
 *
 * 4 个 step：
 *   1. F · 学习产出      — 背单词 toggle + 数学时长 slider
 *   2. H · 健康自控      — 6 项 grid toggle，每项 +0.5 H
 *   3. 熬夜申报          — slider 0-6h，每 1h 扣 -2 H
 *   4. 总结              — 显示 derived F / H / 净额，一键确认
 *
 * 经济：
 *   F gain = 背单词(0.5) + round(mathMin / 30) * 1
 *   H gain = sum(checks) * 0.5  − overnightH * 2
 *
 * 设计调性：
 *   - F 部分 tomato accent / H 部分 sage / 熬夜 plum
 *   - 步骤 progress dots 顶部
 *   - toggle 按钮选中态用 col-soft 背景 + col 文字
 *   - 总计大字仅在 step 4（情感峰值），日常 step 内字号克制
 */

import { useEffect, useMemo, useState } from "react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
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
  | "sleep"
  | "early"
  | "water"
  | "exercise"
  | "diet"
  | "breakfast";

interface HItem {
  id: HItemId;
  label: string;
  hint?: string;
}

const H_ITEMS: HItem[] = [
  { id: "sleep", label: "睡眠 ≥ 7h" },
  { id: "early", label: "前夜早睡", hint: "< 1am" },
  { id: "water", label: "喝水 ≥ 1.5L" },
  { id: "exercise", label: "运动 ≥ 30 min" },
  { id: "diet", label: "饮食克制" },
  { id: "breakfast", label: "早餐有蛋白" },
];

const STEP_TITLES: Record<Step, { title: string; sub?: string }> = {
  1: { title: "结算 · F (学习产出)" },
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
  const [mathMin, setMathMin] = useState(60);
  const [hChecks, setHChecks] = useState<Record<HItemId, boolean>>({
    sleep: false,
    early: false,
    water: false,
    exercise: false,
    diet: false,
    breakfast: false,
  });
  const [overnightH, setOvernightH] = useState(0);

  // Reset on (re)open. We don't reset on close so accidentally
  // bumping the sheet doesn't wipe progress mid-session.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setVocab(false);
    setMathMin(60);
    setHChecks({
      sleep: false,
      early: false,
      water: false,
      exercise: false,
      diet: false,
      breakfast: false,
    });
    setOvernightH(0);
  }, [open]);

  // Derived ledger — recomputed every render, cheap.
  // 数学时长不在结算里算 — 由番茄 #math tag 自动累加进 todayMathPomos +
  // ftoken。结算只处理无法被番茄追踪的项目（背单词等）。
  const fGained = useMemo(() => (vocab ? 0.5 : 0), [vocab]);

  const hRaw = useMemo(
    () =>
      Object.values(hChecks).reduce(
        (sum, ok) => sum + (ok ? 0.5 : 0),
        0,
      ),
    [hChecks],
  );

  const overnightLoss = overnightH * 2;
  const hGained = hRaw - overnightLoss;

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
          <FStep vocab={vocab} setVocab={setVocab} fGained={fGained} />
        )}
        {step === 2 && (
          <HStep hChecks={hChecks} setHChecks={setHChecks} hRaw={hRaw} />
        )}
        {step === 3 && (
          <OvernightStep
            overnightH={overnightH}
            setOvernightH={setOvernightH}
            overnightLoss={overnightLoss}
          />
        )}
        {step === 4 && (
          <SummaryStep
            fGained={fGained}
            hRaw={hRaw}
            overnightLoss={overnightLoss}
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
/*  Step 1 — F                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function FStep({
  vocab,
  setVocab,
  fGained,
}: {
  vocab: boolean;
  setVocab: (v: boolean) => void;
  fGained: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Vocab toggle — 数学时长由 #math 番茄自动累计，不在这里算 */}
      <div>
        <div className="smallcaps mb-2.5">背单词</div>
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
            <span className="text-[14px]">今天背了单词</span>
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

      {/* Subtotal */}
      <div className="flex items-baseline justify-between border-t border-rule pt-4">
        <span className="smallcaps">F 小计</span>
        <span className="font-serif text-[24px] tabular-nums text-tomato">
          +{fGained.toFixed(1)} F
        </span>
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
  overnightLoss,
}: {
  overnightH: number;
  setOvernightH: (n: number) => void;
  overnightLoss: number;
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
            {overnightH > 0 ? `−${overnightLoss} H` : "—"}
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
        每 1h = <span className="font-mono text-plum">−2 H</span>
        <span className="mx-2 text-ink-mute">·</span>
        被动失眠不算在内
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
  overnightLoss,
  hGained,
}: {
  fGained: number;
  hRaw: number;
  overnightLoss: number;
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
          <span
            className={cn(
              "font-serif italic text-[44px] leading-none tabular-nums",
              hGained < 0 ? "text-plum" : "text-sage-deep",
            )}
          >
            {hGained >= 0 ? "+" : ""}
            {hGained.toFixed(1)}
            <span className="ml-1 font-sans text-base text-ink-3">H</span>
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-2 text-[13px]">
        <Row label="F · 学习产出" value={`+${fGained.toFixed(1)}`} tone="tomato" />
        <Row label="H · 健康基础分" value={`+${hRaw.toFixed(1)}`} tone="sage" />
        {overnightLoss > 0 && (
          <Row
            label="H · 熬夜扣分"
            value={`−${overnightLoss.toFixed(1)}`}
            tone="plum"
          />
        )}
        <div className="my-1 h-px bg-rule" />
        <Row
          label="H 净入账"
          value={`${hGained >= 0 ? "+" : ""}${hGained.toFixed(1)}`}
          tone={hGained < 0 ? "plum" : "sage"}
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
