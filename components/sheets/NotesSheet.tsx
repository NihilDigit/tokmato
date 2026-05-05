"use client";

/**
 * NotesSheet — 一串番茄结束后回顾期间闪过的想法 (distraction notes)。
 *
 * 番茄运行时用户在专注 input 里写下来的想法都被收集在 session.notes，
 * 结束时这个 sheet 让用户为每条想法分配 action：
 *   - inbox  暂存到 Kanban Inbox
 *   - Q1..Q4 直接进对应象限
 *   - delete 不重要 / 已无意义
 *
 * 默认全部 inbox（最低摩擦：直接点入账即清空收件箱）。
 *
 * 设计调性：
 *   - Note 文本走 font-kaiti italic — 手记感
 *   - segmented action picker = 6 项 pill row（5 quadrant + ✕）
 *     选中态用对应象限的 col 着色（match Kanban 配色）
 *   - 删除选项用 plum 着色
 *   - 空态：不显示空 list，直接给一行 muted 提示 + "完成"
 */

import { useEffect, useState } from "react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";
import type { KanbanColumnId } from "@/lib/types";

type Action = KanbanColumnId | "delete";

export interface NotesAssignment {
  note: string;
  action: Action;
}

export interface NotesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** session.notes — 期间闪过的想法（按出现顺序）。 */
  notes: string[];
  onConfirm: (assignments: NotesAssignment[]) => void;
}

interface ActionDef {
  id: Action;
  label: string;
  /** Inactive label color. */
  idleText: string;
  /** Active state classes — bg + text together. */
  active: string;
}

// match Kanban 配色：inbox=ink-mute / Q1=tomato / Q2=sage / Q3=plum / Q4=gold
const ACTIONS: ActionDef[] = [
  {
    id: "inbox",
    label: "Inbox",
    idleText: "text-ink-mute",
    active: "bg-ink-2 text-paper",
  },
  {
    id: "Q1",
    label: "Q1",
    idleText: "text-tomato",
    active: "bg-tomato text-white",
  },
  {
    id: "Q2",
    label: "Q2",
    idleText: "text-sage-deep",
    active: "bg-sage text-white",
  },
  {
    id: "Q3",
    label: "Q3",
    idleText: "text-plum",
    active: "bg-plum text-white",
  },
  {
    id: "Q4",
    label: "Q4",
    idleText: "text-gold",
    active: "bg-gold text-white",
  },
  {
    id: "delete",
    label: "✕",
    idleText: "text-ink-mute",
    active: "bg-plum/15 text-plum",
  },
];

export function NotesSheet({
  open,
  onOpenChange,
  notes,
  onConfirm,
}: NotesSheetProps) {
  // Default everyone to "inbox" — the lowest-friction sweep.
  const [actions, setActions] = useState<Record<number, Action>>(() =>
    Object.fromEntries(notes.map((_, i) => [i, "inbox" as Action])),
  );

  // Re-seed when reopened with different notes (e.g. a new pomodoro string).
  useEffect(() => {
    if (!open) return;
    setActions(
      Object.fromEntries(notes.map((_, i) => [i, "inbox" as Action])),
    );
  }, [open, notes]);

  const isEmpty = notes.length === 0;

  const handleConfirm = () => {
    const assignments: NotesAssignment[] = notes.map((note, i) => ({
      note,
      action: actions[i] ?? "inbox",
    }));
    onConfirm(assignments);
  };

  const setAction = (i: number, a: Action) =>
    setActions((prev) => ({ ...prev, [i]: a }));

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="font-kaiti italic">
          回顾这一串番茄的想法
        </span>
      }
      description={
        isEmpty
          ? undefined
          : `${notes.length} 条，默认全部进 Inbox`
      }
    >
      <div className="flex flex-col gap-6">
        {isEmpty ? (
          <p className="text-sm text-ink-3">
            这串番茄没有闪过的想法，直接结束
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note, i) => {
              const current = actions[i] ?? "inbox";
              const isDelete = current === "delete";
              return (
                <li
                  key={i}
                  className={cn(
                    "rounded-xl border border-rule px-4 py-3",
                    "flex flex-col gap-3",
                    "transition-opacity",
                    isDelete && "opacity-55",
                  )}
                >
                  <p
                    className={cn(
                      "font-kaiti italic text-[15px] leading-snug text-ink",
                      isDelete && "line-through text-ink-3",
                    )}
                  >
                    {note}
                  </p>
                  <ActionPicker
                    value={current}
                    onChange={(a) => setAction(i, a)}
                    label={`第 ${i + 1} 条想法的去向`}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <Footer
          isEmpty={isEmpty}
          onCancel={() => onOpenChange(false)}
          onConfirm={handleConfirm}
        />
      </div>
    </ResponsiveSheet>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Segmented action picker                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

function ActionPicker({
  value,
  onChange,
  label,
}: {
  value: Action;
  onChange: (a: Action) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center gap-1",
        "rounded-full border border-rule bg-paper-2/40 p-1",
        // shrink to content width on its own row but allow wrap on narrow
        "self-start max-w-full",
      )}
    >
      {ACTIONS.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.id === "delete" ? "删除" : opt.label}
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex min-h-7 items-center justify-center",
              "rounded-full px-3 font-mono text-[12px] leading-none",
              "transition-colors",
              isActive
                ? opt.active
                : cn("bg-transparent hover:text-ink", opt.idleText),
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Footer                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function Footer({
  isEmpty,
  onCancel,
  onConfirm,
}: {
  isEmpty: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-rule pt-5">
      {!isEmpty && (
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "inline-flex min-h-10 items-center rounded-full px-4",
            "text-sm text-ink-3 hover:text-ink",
            "transition-colors",
          )}
        >
          取消
        </button>
      )}
      <button
        type="button"
        onClick={onConfirm}
        className={cn(
          "inline-flex min-h-10 items-center rounded-full",
          "bg-ink px-5 text-sm font-medium text-paper",
          "hover:bg-ink-2 transition-colors",
        )}
      >
        {isEmpty ? "完成" : "入账"}
      </button>
    </div>
  );
}
