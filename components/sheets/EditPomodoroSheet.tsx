"use client";

/**
 * EditPomodoroSheet — edit or delete a stored pomodoro record.
 *
 * Editable: tag, result label.
 * Frozen: startedAt / endedAt / count / minutes (history is the
 * narration of what happened; we don't rewrite the past).
 *
 * Delete reverses the F + bonusF the record had earned and (when the
 * record belongs to today) rolls back today's per-tag and total
 * counters; see store.deletePomodoroRecord.
 */

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { useStore } from "@/lib/store";
import { TAG_CHIP_CLASSES } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";
import type { PomodoroRecord, TagId } from "@/lib/types";

export interface EditPomodoroSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PomodoroRecord | null;
}

function fmtDateTime(epoch: number): string {
  const d = new Date(epoch);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function EditPomodoroSheet({
  open,
  onOpenChange,
  record,
}: EditPomodoroSheetProps) {
  const tags = useStore((s) => s.tags);
  const updatePomodoroRecord = useStore((s) => s.updatePomodoroRecord);
  const deletePomodoroRecord = useStore((s) => s.deletePomodoroRecord);

  const [tag, setTag] = useState<TagId>(record?.tag ?? "");
  const [result, setResult] = useState(record?.result ?? record?.task ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Re-seed when the sheet (re)opens with a different record.
  useEffect(() => {
    if (!open || !record) return;
    setTag(record.tag);
    setResult(record.result ?? record.task);
    setConfirmingDelete(false);
  }, [open, record]);

  if (!record) return null;

  const trimmedResult = result.trim();
  const dirty =
    tag !== record.tag ||
    trimmedResult !== (record.result ?? record.task);

  const handleSave = () => {
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    updatePomodoroRecord(record.id, {
      ...(tag !== record.tag ? { tag } : {}),
      ...(trimmedResult !== (record.result ?? record.task)
        ? { result: trimmedResult }
        : {}),
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    deletePomodoroRecord(record.id);
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="编辑番茄记录"
    >
      <div className="flex flex-col gap-6">
        {/* Frozen meta — narration the user can't rewrite. */}
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-rule bg-rule">
          <MetaCell kicker="番茄数" value={`${record.count}`} />
          <MetaCell kicker="时长" value={`${record.minutes} min`} />
          <MetaCell
            kicker="结束于"
            value={fmtDateTime(record.endedAt)}
            small
          />
        </dl>

        {/* Tag picker. */}
        <div>
          <div className="smallcaps mb-2.5">Tag</div>
          {tags.length === 0 ? (
            <p className="text-sm text-ink-3">还没有 Tag。</p>
          ) : (
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="任务标签"
            >
              {tags.map((t) => {
                const isActive = tag === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setTag(t.id)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5",
                      "font-mono text-[13px] leading-none",
                      "transition-colors",
                      isActive
                        ? cn(TAG_CHIP_CLASSES[t.color], "border border-transparent")
                        : "bg-transparent text-ink-3 border border-rule hover:text-ink-2",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
          {tag !== record.tag && (
            <p className="mt-2 text-[11px] text-ink-mute">
              改 tag 不会重算当时的 F/bonus
            </p>
          )}
        </div>

        {/* Result / description. */}
        <div>
          <div className="smallcaps mb-2">描述</div>
          <input
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder={record.task}
            className={cn(
              "w-full border-0 border-b border-rule bg-transparent px-0 py-2",
              "font-kaiti text-[16px] text-ink focus:border-tomato focus:outline-none",
            )}
          />
          <p className="mt-1 text-[11px] text-ink-mute">
            原任务名 · {record.task}
          </p>
        </div>

        {/* Footer: delete (left) + save/cancel (right). */}
        <div className="flex items-center justify-between gap-2 border-t border-rule pt-5">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="min-h-10 rounded-full px-3 text-sm text-ink-3 hover:text-ink"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-plum px-4 text-sm font-medium text-paper hover:bg-plum/90"
              >
                <Trash2 size={14} />
                确认删除
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-rule px-3.5 text-sm text-plum hover:border-plum/40"
            >
              <Trash2 size={14} />
              删除
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-10 rounded-full px-4 text-sm text-ink-3 hover:text-ink"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!trimmedResult}
              className={cn(
                "min-h-10 rounded-full bg-ink px-5 text-sm font-medium text-paper",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {dirty ? "保存" : "完成"}
            </button>
          </div>
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function MetaCell({
  kicker,
  value,
  small,
}: {
  kicker: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-paper p-3.5">
      <div className="smallcaps">{kicker}</div>
      <div
        className={cn(
          "font-mono leading-tight text-ink",
          small ? "text-[13px]" : "text-[18px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
