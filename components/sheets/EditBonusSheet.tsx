"use client";

/**
 * EditBonusSheet — add or edit a single tier-bonus rule.
 *
 * Bonus = (tagId, threshold, initialReward, step, stepReward). The
 * tag picker is a dropdown over the user's current tags. Edit mode
 * also shows a delete affordance.
 */

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { TAG_BG_CLASSES } from "@/lib/tag-colors";
import type { BonusConfig, TagConfig, TagId } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface EditBonusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagConfig[];
  /** Defined for edit; omitted for add. */
  initial?: Omit<BonusConfig, "id">;
  onConfirm: (data: Omit<BonusConfig, "id">) => void;
  onDelete?: () => void;
}

const DEFAULT_VALUES = {
  threshold: 5,
  initialReward: 1,
  step: 2,
  stepReward: 1,
} as const;

export function EditBonusSheet({
  open,
  onOpenChange,
  tags,
  initial,
  onConfirm,
  onDelete,
}: EditBonusSheetProps) {
  const isEdit = initial !== undefined;
  const fallbackTagId = tags[0]?.id ?? "";

  const [tagId, setTagId] = useState<TagId>(initial?.tagId ?? fallbackTagId);
  const [threshold, setThreshold] = useState(
    initial?.threshold ?? DEFAULT_VALUES.threshold,
  );
  const [initialReward, setInitialReward] = useState(
    initial?.initialReward ?? DEFAULT_VALUES.initialReward,
  );
  const [step, setStep] = useState(initial?.step ?? DEFAULT_VALUES.step);
  const [stepReward, setStepReward] = useState(
    initial?.stepReward ?? DEFAULT_VALUES.stepReward,
  );
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Re-seed when sheet opens or initial swaps.
  useEffect(() => {
    if (!open) return;
    setTagId(initial?.tagId ?? fallbackTagId);
    setThreshold(initial?.threshold ?? DEFAULT_VALUES.threshold);
    setInitialReward(initial?.initialReward ?? DEFAULT_VALUES.initialReward);
    setStep(initial?.step ?? DEFAULT_VALUES.step);
    setStepReward(initial?.stepReward ?? DEFAULT_VALUES.stepReward);
  }, [open, initial, fallbackTagId]);

  const tagExists = tags.some((t) => t.id === tagId);
  const canSave =
    tagExists &&
    Number.isFinite(threshold) &&
    threshold >= 0 &&
    Number.isFinite(initialReward) &&
    Number.isFinite(step) &&
    step >= 0 &&
    Number.isFinite(stepReward);

  const handleSave = () => {
    if (!canSave) return;
    onConfirm({ tagId, threshold, initialReward, step, stepReward });
    onOpenChange(false);
  };

  const previewTiers = (() => {
    if (!Number.isFinite(threshold) || threshold < 0) return [];
    const out: { pomos: number; reward: number }[] = [
      { pomos: threshold, reward: initialReward },
    ];
    if (step > 0) {
      for (let n = 1; n < 5; n++) {
        out.push({ pomos: threshold + n * step, reward: stepReward });
      }
    }
    return out;
  })();

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑 Bonus" : "新建 Bonus"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="flex flex-col gap-7"
      >
        {/* Tag picker */}
        <div>
          <div className="smallcaps mb-2.5">关联 Tag</div>
          {tags.length === 0 ? (
            <p className="text-sm text-ink-3">先到上面新建一个 Tag。</p>
          ) : (
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="关联的 Tag"
            >
              {tags.map((t) => {
                const active = tagId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTagId(t.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5",
                      "font-mono text-[13px] leading-none transition-colors",
                      active
                        ? "border-[1.5px] border-ink bg-ink/4 text-ink"
                        : "border border-rule text-ink-3 hover:text-ink-2",
                    )}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-full", TAG_BG_CLASSES[t.color])}
                    />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Four numeric params */}
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label="起步点"
            sub="第一档需要的番茄数"
            value={threshold}
            onChange={setThreshold}
            min={0}
            inputRef={firstInputRef}
          />
          <NumberField
            label="起步价"
            sub="第一档奖几 F"
            value={initialReward}
            onChange={setInitialReward}
            allowNegative
          />
          <NumberField
            label="步长"
            sub="每档间隔几个番茄"
            value={step}
            onChange={setStep}
            min={0}
          />
          <NumberField
            label="每步价"
            sub="之后每档奖几 F"
            value={stepReward}
            onChange={setStepReward}
            allowNegative
          />
        </div>

        {/* Preview */}
        {previewTiers.length > 0 && (
          <div>
            <div className="smallcaps mb-2">预览前 5 档</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
              {previewTiers.map((t, i) => (
                <span
                  key={i}
                  className="mono inline-flex items-center gap-1 rounded-full border border-rule px-2 py-0.5"
                >
                  {t.pomos} 番 → +{t.reward} F
                </span>
              ))}
              {step > 0 && (
                <span className="text-ink-mute">… 自然外推</span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-rule pt-5">
          {isEdit && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4",
                "text-sm text-plum hover:bg-plum/8",
                "transition-colors",
              )}
            >
              <Trash2 size={14} />
              删除
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full px-4",
                "text-sm text-ink-3 hover:text-ink",
                "transition-colors",
              )}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full",
                "bg-ink px-5 text-sm font-medium text-paper",
                "hover:bg-ink-2 transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink",
              )}
            >
              保存
            </button>
          </div>
        </div>
      </form>
    </ResponsiveSheet>
  );
}

function NumberField({
  label,
  sub,
  value,
  onChange,
  min,
  allowNegative,
  inputRef,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  allowNegative?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="smallcaps">{label}</span>
        {sub && <span className="text-[10px] text-ink-mute">{sub}</span>}
      </div>
      <input
        ref={inputRef}
        type="number"
        inputMode={allowNegative ? "decimal" : "numeric"}
        step={1}
        min={allowNegative ? undefined : (min ?? 0)}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(n);
        }}
        className={cn(
          "w-full bg-transparent border-0 border-b-2 border-rule",
          "px-0 py-2 font-mono text-[18px] leading-snug text-ink",
          "focus:border-tomato focus:outline-none transition-colors",
        )}
      />
    </label>
  );
}
