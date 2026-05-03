"use client";

/**
 * AddKanbanSheet — replace the legacy `window.prompt` with a
 * ResponsiveSheet so adding a card matches the rest of the app.
 *
 * Two fields:
 *   - 任务  (required)   — short identifier
 *   - 下一步 (optional)  — concrete first action ("→ ...")
 *
 * Confirms on Enter inside the task input. The target column is
 * passed in by the parent so the sheet can echo "添加到 Q1" etc.
 */

import { useEffect, useRef, useState } from "react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";
import type { KanbanColumnId } from "@/lib/types";

const COL_LABEL: Record<KanbanColumnId, string> = {
  inbox: "Inbox",
  Q1: "Q1 主线 deadline",
  Q2: "Q2 长期投资",
  Q3: "Q3 不可避免杂事",
  Q4: "Q4 精神维护",
};

const COL_ACCENT: Record<KanbanColumnId, string> = {
  inbox: "text-ink-mute",
  Q1: "text-tomato",
  Q2: "text-sage",
  Q3: "text-plum",
  Q4: "text-gold",
};

export interface AddKanbanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Column the new card will land in. Renders as a kicker in the title. */
  col: KanbanColumnId | null;
  onConfirm: (data: { name: string; next: string }) => void;
}

export function AddKanbanSheet({
  open,
  onOpenChange,
  col,
  onConfirm,
}: AddKanbanSheetProps) {
  const [name, setName] = useState("");
  const [next, setNext] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setNext("");
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  const valid = name.trim().length > 0;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm({ name: name.trim(), next: next.trim() });
    onOpenChange(false);
  };

  const accent = col ? COL_ACCENT[col] : "text-ink-mute";
  const label = col ? COL_LABEL[col] : "Inbox";

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          新任务 <span className={cn("not-italic font-mono text-base", accent)}>· {label}</span>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleConfirm();
        }}
        className="flex flex-col gap-6"
      >
        <div>
          <div className="smallcaps mb-2">任务</div>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="一句话写清楚要做什么"
            aria-label="任务名"
            className={cn(
              "w-full bg-transparent border-0 border-b-2 border-rule",
              "px-0 py-2.5 font-serif text-[18px] leading-snug text-ink",
              "placeholder:text-ink-mute focus:border-tomato focus:outline-none",
              "transition-colors"
            )}
          />
        </div>

        <div>
          <div className="smallcaps mb-2">下一步（选填）</div>
          <input
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="第一个具体动作 (空着也行)"
            aria-label="下一步"
            maxLength={200}
            className={cn(
              "w-full border-0 border-b border-rule bg-transparent",
              "px-0 py-2 text-[14px] leading-snug text-ink-2",
              "placeholder:text-ink-mute focus:border-ink/40 focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:rounded-sm",
              "font-kaiti"
            )}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-sm text-ink-3 hover:text-ink"
          >
            取消
          </button>
          <button
            type="submit"
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
      </form>
    </ResponsiveSheet>
  );
}
