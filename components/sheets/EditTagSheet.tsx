"use client";

/**
 * EditTagSheet — add or edit a single tag.
 *
 * Two-mode: pass `initial` to edit an existing tag; omit for add.
 * Edit mode shows a delete button. Hard delete (per project decision)
 * — caller is responsible for the actual removeTag dispatch and any
 * confirm prompt.
 */

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { TAG_BG_CLASSES } from "@/lib/tag-colors";
import { TAG_COLORS, type TagColor } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface EditTagSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Defined for edit mode; undefined for add. */
  initial?: { label: string; color: TagColor };
  onConfirm: (data: { label: string; color: TagColor }) => void;
  /** When set, renders a delete affordance (edit mode only). */
  onDelete?: () => void;
}

export function EditTagSheet({
  open,
  onOpenChange,
  initial,
  onConfirm,
  onDelete,
}: EditTagSheetProps) {
  const isEdit = initial !== undefined;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [color, setColor] = useState<TagColor>(initial?.color ?? "tomato");
  const [armDelete, setArmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-seed when the sheet opens or `initial` swaps to a different tag.
  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setColor(initial?.color ?? "tomato");
    setArmDelete(false);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open, initial]);

  const trimmed = label.trim();
  const canSave = trimmed.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onConfirm({ label: trimmed, color });
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑 Tag" : "新建 Tag"}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="flex flex-col gap-7"
      >
        <div>
          <div className="smallcaps mb-2">名称</div>
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="#math"
            aria-label="Tag 名称"
            className={cn(
              "w-full bg-transparent border-0 border-b-2 border-rule",
              "px-0 py-3 font-serif text-[19px] leading-snug text-ink",
              "placeholder:text-ink-mute focus:border-tomato focus:outline-none",
              "transition-colors",
            )}
          />
        </div>

        <div>
          <div className="smallcaps mb-2.5">颜色</div>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="颜色"
          >
            {TAG_COLORS.map((c) => {
              const active = c === color;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-full transition-transform",
                    TAG_BG_CLASSES[c],
                    active
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-paper scale-110"
                      : "ring-1 ring-rule hover:scale-105",
                  )}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-rule pt-5">
          {isEdit && onDelete ? (
            <button
              type="button"
              onClick={() => {
                if (!armDelete) {
                  setArmDelete(true);
                  return;
                }
                onDelete();
                onOpenChange(false);
              }}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4",
                "text-sm transition-colors",
                armDelete
                  ? "bg-plum text-paper hover:bg-plum/85"
                  : "text-plum hover:bg-plum/8",
              )}
            >
              <Trash2 size={14} />
              {armDelete ? "再点确认（同时删关联 bonus）" : "删除"}
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
