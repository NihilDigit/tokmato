"use client";

/**
 * KanbanCardSheet — unified add/edit form for a kanban card.
 *
 * Two fields:
 *   - 任务   (required)  — short identifier
 *   - 下一步 (optional)  — concrete first action ("→ ...")
 *
 * Edit mode (when `card` is provided) shows a 删除 button on the left;
 * the first click arms it (二次点确认)，避免误触。
 */

import { useEffect, useRef, useState } from "react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";
import type { KanbanCard, KanbanColumnId } from "@/lib/types";

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

export interface KanbanCardSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Column the card lives in (used for the title kicker). */
  col: KanbanColumnId | null;
  /** When set, the sheet is in edit mode. */
  card?: KanbanCard | null;
  onConfirm: (data: { name: string; next: string }) => void;
  /** Only called in edit mode. */
  onDelete?: () => void;
}

export function KanbanCardSheet({
  open,
  onOpenChange,
  col,
  card,
  onConfirm,
  onDelete,
}: KanbanCardSheetProps) {
  const isEdit = !!card;

  const [name, setName] = useState("");
  const [next, setNext] = useState("");
  const [armDelete, setArmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(card?.name ?? "");
    setNext(card?.next ?? "");
    setArmDelete(false);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open, card]);

  const valid = name.trim().length > 0;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm({ name: name.trim(), next: next.trim() });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (!armDelete) {
      setArmDelete(true);
      return;
    }
    onDelete();
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
          {isEdit ? "编辑任务" : "新任务"}{" "}
          <span className={cn("not-italic font-mono text-base", accent)}>
            · {label}
          </span>
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

        <div className="flex items-center justify-between gap-3 pt-1">
          {isEdit && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              className={cn(
                "min-h-11 rounded-full px-4 py-2 text-sm font-medium transition",
                armDelete
                  ? "bg-tomato text-paper hover:bg-tomato/90"
                  : "text-ink-3 hover:text-tomato"
              )}
            >
              {armDelete ? "再点一次确认" : "删除"}
            </button>
          ) : (
            <span aria-hidden />
          )}

          <div className="flex items-center gap-3">
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
              {isEdit ? "保存" : "添加"}
            </button>
          </div>
        </div>
      </form>
    </ResponsiveSheet>
  );
}
