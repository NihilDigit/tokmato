"use client";

/**
 * StartSheet — 启动新番茄串。
 *
 * 紧凑 app 化（不是 hero 大字）：任务名 input + recent chips + tag 单选 +
 * 类型 (input/output) 二选一 + 底部 取消 / 开始按钮。
 *
 * Sheet 容器走 ResponsiveSheet（mobile bottom / desktop centered），本组件
 * 只负责字段。Token 全走 var：text-tomato / bg-tomato / border-rule / text-ink-3。
 */

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { cn } from "@/lib/utils";
import type { TagId, SessionType } from "@/lib/types";

export interface StartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recent task strings to render as pre-fill chips (first 5 used). */
  recentTasks?: string[];
  /** Optional initial task value (e.g. clicking a chip from outside). */
  initialTask?: string;
  onConfirm: (data: { task: string; tag: TagId; type: SessionType }) => void;
}

type TagDef = {
  id: TagId;
  label: string;
  /** Active state classes — bg + text together. */
  active: string;
};

// Inline TAGS — colors derived from legacy/tokmato.html line 88-94, but
// expressed in token utility classes (no raw hex).
const TAGS: TagDef[] = [
  { id: "cs", label: "#cs", active: "bg-paper-2 text-ink" },
  { id: "math", label: "#math", active: "bg-tomato text-white" },
  { id: "english", label: "#english", active: "bg-sage text-white" },
  { id: "others", label: "#others", active: "bg-gold-soft text-ink" },
  { id: "trash", label: "#trash", active: "bg-plum text-white" },
];

type TypeOptionDef = {
  id: SessionType;
  label: string;
  sub: string;
  rate: string;
};

const TYPE_OPTIONS: TypeOptionDef[] = [
  { id: "input", label: "输入型", sub: "读 / 听 / 看 / 理解", rate: "+1 F / 番茄" },
  { id: "output", label: "输出型", sub: "做 / 写 / 练 / 产出", rate: "+0.5 F / 番茄" },
];

export function StartSheet({
  open,
  onOpenChange,
  recentTasks = [],
  initialTask,
  onConfirm,
}: StartSheetProps) {
  const [task, setTask] = useState(initialTask ?? "");
  const [tag, setTag] = useState<TagId>("math");
  const [type, setType] = useState<SessionType>("input");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset / focus on open. Sync `initialTask` when it changes externally
  // (e.g. user taps a recent chip on Home before opening).
  useEffect(() => {
    if (!open) return;
    setTask(initialTask ?? "");
    // Defer focus until sheet animation has mounted the input.
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open, initialTask]);

  const canStart = task.trim().length > 0;

  const handleConfirm = () => {
    if (!canStart) return;
    onConfirm({ task: task.trim(), tag, type });
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          这个 25 分钟<br />我要做什么?
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleConfirm();
        }}
        className="flex flex-col gap-7"
      >
        {/* Task input — bottom-rule only, no box. */}
        <div>
          <input
            ref={inputRef}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="线代第 3 章错题 12-16"
            aria-label="任务名"
            className={cn(
              "w-full bg-transparent border-0 border-b-2 border-rule",
              "px-0 py-3 font-serif text-[19px] leading-snug text-ink",
              "placeholder:text-ink-mute focus:border-tomato focus:outline-none",
              "transition-colors"
            )}
          />
        </div>

        {/* Recent chips. */}
        {recentTasks.length > 0 && (
          <div>
            <div className="smallcaps mb-2">最近</div>
            <div className="flex flex-wrap gap-1.5">
              {recentTasks.slice(0, 5).map((t, i) => (
                <button
                  key={`${t}-${i}`}
                  type="button"
                  onClick={() => {
                    setTask(t);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "rounded-full border border-rule px-3 py-1.5",
                    "text-[13px] text-ink-2",
                    "hover:border-tomato/30 hover:text-ink",
                    "transition-colors"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tag — single select. */}
        <div>
          <div className="smallcaps mb-2.5">Tag · 单选</div>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="任务标签"
          >
            {TAGS.map((t) => {
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
                      ? cn(t.active, "border border-transparent")
                      : "bg-transparent text-ink-3 border border-rule hover:text-ink-2"
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Type — input vs output. */}
        <div>
          <div className="smallcaps mb-2.5">类型 · 决定 token 单价</div>
          <div
            className="grid grid-cols-2 gap-2.5"
            role="radiogroup"
            aria-label="番茄类型"
          >
            {TYPE_OPTIONS.map((opt) => {
              const isActive = type === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setType(opt.id)}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl p-4 text-left",
                    "transition-colors",
                    isActive
                      ? "border-[1.5px] border-ink bg-ink/4"
                      : "border border-rule bg-transparent hover:border-ink/30"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-serif text-[20px] leading-tight text-ink">
                      {opt.label}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        isActive ? "text-tomato" : "text-ink-3"
                      )}
                    >
                      {opt.rate}
                    </span>
                  </div>
                  <span className="text-[12px] text-ink-3">{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer actions. */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full px-4",
              "text-sm text-ink-3 hover:text-ink",
              "transition-colors"
            )}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!canStart}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full",
              "bg-tomato px-5 text-sm font-medium text-white",
              "hover:bg-tomato-deep transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-tomato"
            )}
          >
            <Play size={16} fill="currentColor" strokeWidth={0} />
            开始 25 分钟
          </button>
        </div>
      </form>
    </ResponsiveSheet>
  );
}
