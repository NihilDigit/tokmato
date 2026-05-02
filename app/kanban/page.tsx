"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────
type Card = { id: string; name: string; next: string };
type ColId = "inbox" | "Q1" | "Q2" | "Q3" | "Q4";
type Col = {
  id: ColId;
  shortLabel: string; // for mobile tab
  label: string;
  sub: string;
  // Tailwind utility classes pinned to design tokens
  dot: string; // bg-*
  text: string; // text-*
  border: string; // border-*
  bgSoft: string; // bg-*/[0.x] for active tab
};

// ─────────────────────────────────────────────────────────────────────────
// Column meta — colors via token utilities (no raw hex)
// ─────────────────────────────────────────────────────────────────────────
const COLS: Col[] = [
  {
    id: "inbox",
    shortLabel: "Inbox",
    label: "Inbox",
    sub: "未分类 · 从便签流入",
    dot: "bg-ink-mute",
    text: "text-ink-mute",
    border: "border-ink-mute/40",
    bgSoft: "bg-ink/5",
  },
  {
    id: "Q1",
    shortLabel: "Q1",
    label: "Q1 主线 deadline",
    sub: "重要 + 紧急",
    dot: "bg-tomato",
    text: "text-tomato",
    border: "border-tomato/50",
    bgSoft: "bg-tomato/10",
  },
  {
    id: "Q2",
    shortLabel: "Q2",
    label: "Q2 长期投资",
    sub: "重要 + 不紧急 · 真正的人生增量",
    dot: "bg-sage",
    text: "text-sage",
    border: "border-sage/50",
    bgSoft: "bg-sage/10",
  },
  {
    id: "Q3",
    shortLabel: "Q3",
    label: "Q3 不可避免杂事",
    sub: "不重要 + 紧急 · 压缩它",
    dot: "bg-plum",
    text: "text-plum",
    border: "border-plum/50",
    bgSoft: "bg-plum/10",
  },
  {
    id: "Q4",
    shortLabel: "Q4",
    label: "Q4 精神维护",
    sub: "不重要 + 不紧急 · 续命",
    dot: "bg-gold",
    text: "text-gold",
    border: "border-gold/50",
    bgSoft: "bg-gold/15",
  },
];

const COL_BY_ID: Record<ColId, Col> = COLS.reduce(
  (acc, col) => ({ ...acc, [col.id]: col }),
  {} as Record<ColId, Col>
);

// ─────────────────────────────────────────────────────────────────────────
// Mock data — 1:1 from legacy state.kanban
// ─────────────────────────────────────────────────────────────────────────
const INITIAL: Record<ColId, Card[]> = {
  inbox: [
    { id: "k1", name: "想看那本 Operating Systems: Three Easy Pieces", next: "下载 PDF 试读 1 章" },
    { id: "k2", name: "研究 jaxopt 库", next: "看 README + 跑 1 个例子" },
  ],
  Q1: [
    { id: "k3", name: "考研数学线代第三章", next: "今晚 3 个番茄, 做完真题部分" },
    { id: "k4", name: "英语阅读真题套", next: "完成 2017 阅读 4 篇" },
  ],
  Q2: [
    { id: "k5", name: "Transformer from scratch 复现", next: "实现 multi-head attention forward pass" },
    { id: "k6", name: "健身房抗阻训练", next: "今天 push day" },
    { id: "k7", name: "读 Attention Is All You Need", next: "精读第 3 节" },
  ],
  Q3: [
    { id: "k8", name: "报销学校发票", next: "收齐发票, 周三去财务" },
    { id: "k9", name: "洗床单", next: "丢洗衣机" },
  ],
  Q4: [
    { id: "k10", name: "《卡拉马佐夫兄弟》", next: "续读到第二部第三章" },
    { id: "k11", name: "听<<图兰朵>>录音版", next: "第一幕" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────
export default function KanbanPage() {
  // Live state from store. (INITIAL is unused — kept for type ref. Phase 6 cleanup.)
  void INITIAL;
  const cards = useStore((s) => s.kanban) as Record<ColId, Card[]>;
  const moveCard = useStore((s) => s.moveKanbanCard);
  const addCard = useStore((s) => s.addKanbanCard);

  /** Prompt-based add (MVP — replace with proper sheet later if needed). */
  const addNew = (col: ColId) => {
    const name = window.prompt(`添加到 ${col === "inbox" ? "Inbox" : col} 的任务名`);
    if (!name?.trim()) return;
    const id = `k-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    addCard({ col, card: { id, name: name.trim(), next: "" } });
  };

  // Desktop drag state (UI-only, not persisted)
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<ColId | null>(null);

  // Mobile state
  const [activeTab, setActiveTab] = useState<ColId>("inbox");
  const [moveMenu, setMoveMenu] = useState<{
    cardId: string;
    fromCol: ColId;
    anchor: { x: number; y: number };
  } | null>(null);

  // Window-level dragend safety net
  useEffect(() => {
    const reset = () => {
      setDraggedId(null);
      setDragOverColId(null);
    };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
    };
  }, []);

  const handleUpdate = (cardId: string | null, targetCol: ColId) => {
    if (!cardId) return;
    moveCard({ cardId, toCol: targetCol });
  };

  const handleMove = (toCol: ColId) => {
    if (!moveMenu) return;
    if (toCol !== moveMenu.fromCol) {
      handleUpdate(moveMenu.cardId, toCol);
      // Auto-switch tab on mobile so the user follows the card
      setActiveTab(toCol);
    }
    setMoveMenu(null);
  };

  const inboxCol = COLS[0];
  const quadrants = COLS.slice(1);
  const activeCol = COL_BY_ID[activeTab];
  const movingCard = moveMenu
    ? Object.values(cards).flat().find((c) => c.id === moveMenu.cardId)
    : null;

  return (
    <main className="flex flex-col gap-6">
      {/* Title */}
      <header>
        <h1 className="serif italic text-h2 leading-tight">任务菜单, 不是债务</h1>
      </header>

      {/* ─── DESKTOP: Inbox row + 2x2 quadrants ─── */}
      <div className="hidden md:flex md:flex-col md:gap-6">
        <KanbanCol
          col={inboxCol}
          cards={cards.inbox}
          draggedId={draggedId}
          setDraggedId={setDraggedId}
          dragOverColId={dragOverColId}
          setDragOverColId={setDragOverColId}
          onUpdate={handleUpdate}
          onAdd={addNew}
          horizontal
        />
        <section className="grid grid-cols-2 gap-4">
          {quadrants.map((col) => (
            <KanbanCol
              key={col.id}
              col={col}
              cards={cards[col.id]}
              draggedId={draggedId}
              setDraggedId={setDraggedId}
              dragOverColId={dragOverColId}
              setDragOverColId={setDragOverColId}
              onUpdate={handleUpdate}
              onAdd={addNew}
            />
          ))}
        </section>
      </div>

      {/* ─── MOBILE: segmented tabs + single column + long-press radial menu ─── */}
      <div className="flex flex-col gap-4 md:hidden">
        {/* Segmented tabs */}
        <div
          role="tablist"
          aria-label="任务象限"
          className="no-scrollbar flex gap-1 overflow-x-auto rounded-full border border-rule bg-paper-2/60 p-1"
        >
          {COLS.map((col) => {
            const isActive = activeTab === col.id;
            const count = cards[col.id].length;
            return (
              <button
                key={col.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(col.id)}
                className={cn(
                  "flex min-h-9 min-w-0 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition",
                  isActive
                    ? cn("text-ink", col.bgSoft)
                    : "text-ink-3 hover:text-ink"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", col.dot)} aria-hidden />
                <span>{col.shortLabel}</span>
                <span className="mono text-[11px] text-ink-mute tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Active column header */}
        <header className="flex items-end justify-between gap-2">
          <div>
            <div className="serif text-[18px] leading-tight">{activeCol.label}</div>
            <div className="mt-1 text-[12px] leading-snug text-ink-3">{activeCol.sub}</div>
          </div>
          <span className="mono text-[13px] text-ink-3 tabular-nums">{cards[activeTab].length}</span>
        </header>

        {/* Cards stack */}
        <section className="flex flex-col gap-2">
          {cards[activeTab].map((c) => (
            <MobileCardItem
              key={c.id}
              card={c}
              onLongPress={(x, y) =>
                setMoveMenu({ cardId: c.id, fromCol: activeTab, anchor: { x, y } })
              }
            />
          ))}
          <button
            type="button"
            onClick={() => addNew(activeTab)}
            className="rounded-lg border border-dashed border-rule px-3 py-2.5 text-left text-[12px] text-ink-mute transition hover:border-ink-3/40 hover:text-ink-3"
          >
            + 新任务
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
            长按卡片 · 上下左右选目标象限
          </p>
        </section>
      </div>

      {/* Radial move menu (mobile) */}
      {moveMenu && movingCard && (
        <RadialMoveMenu
          card={movingCard}
          fromCol={moveMenu.fromCol}
          anchor={moveMenu.anchor}
          onMove={handleMove}
          onCancel={() => setMoveMenu(null)}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// KanbanCol — desktop column with drop target + cards stack
// ─────────────────────────────────────────────────────────────────────────
function KanbanCol({
  col,
  cards,
  draggedId,
  setDraggedId,
  dragOverColId,
  setDragOverColId,
  onUpdate,
  onAdd,
  horizontal = false,
}: {
  col: Col;
  cards: Card[];
  draggedId: string | null;
  setDraggedId: (id: string | null) => void;
  dragOverColId: ColId | null;
  setDragOverColId: (id: ColId | null) => void;
  onUpdate: (cardId: string | null, targetCol: ColId) => void;
  onAdd: (col: ColId) => void;
  horizontal?: boolean;
}) {
  const isOver = dragOverColId === col.id;
  const isDragging = draggedId !== null;

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        if (dragOverColId !== col.id) setDragOverColId(col.id);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        if (dragOverColId === col.id) setDragOverColId(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onUpdate(draggedId, col.id);
        setDraggedId(null);
        setDragOverColId(null);
      }}
      className={cn(
        "rounded-xl border p-5 transition-colors",
        isOver ? cn(col.border, col.bgSoft) : "border-rule bg-paper/60",
        !horizontal && "min-h-[280px]"
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", col.dot)} aria-hidden />
            <span className="font-serif text-[18px] leading-tight">{col.label}</span>
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-ink-3">{col.sub}</div>
        </div>
        <span className="mono text-[13px] text-ink-3 tabular-nums">{cards.length}</span>
      </header>

      <div className={cn(horizontal ? "flex flex-wrap gap-2" : "flex flex-col gap-2")}>
        {cards.map((c) => (
          <DesktopCardItem
            key={c.id}
            card={c}
            isDragging={draggedId === c.id}
            onDragStart={() => setDraggedId(c.id)}
            onDragEnd={() => setDraggedId(null)}
            horizontal={horizontal}
          />
        ))}

        {isDragging && isOver && (
          <div
            className={cn(
              "rounded-lg border text-[12px] font-medium",
              "px-3 py-2.5",
              col.border,
              col.bgSoft,
              col.text,
              horizontal ? "min-w-[240px] flex-1" : "w-full"
            )}
            aria-hidden
          >
            放进 {col.shortLabel}
          </div>
        )}

        <button
          type="button"
          onClick={() => onAdd(col.id)}
          className={cn(
            "rounded-lg border border-dashed border-rule px-3 py-2.5 text-left text-[12px] text-ink-mute",
            "transition hover:border-ink-3/40 hover:text-ink-3",
            horizontal ? "min-w-[240px]" : "w-full"
          )}
        >
          + 新任务
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DesktopCardItem — HTML5 draggable
// ─────────────────────────────────────────────────────────────────────────
function DesktopCardItem({
  card,
  isDragging,
  onDragStart,
  onDragEnd,
  horizontal,
}: {
  card: Card;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  horizontal: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "select-none rounded-lg border border-rule bg-paper px-3 py-2.5",
        "cursor-grab transition-colors hover:bg-paper-2 active:cursor-grabbing",
        isDragging && "opacity-40",
        horizontal ? "min-w-[240px] flex-1" : "w-full"
      )}
    >
      <div className="font-sans text-[13px] font-medium leading-snug text-ink">{card.name}</div>
      <div className="mt-1 text-xs leading-snug text-ink-3">
        <span className="text-ink-mute">→ </span>
        {card.next}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MobileCardItem — long-press triggers move menu (passes anchor coords)
// ─────────────────────────────────────────────────────────────────────────
const LONG_PRESS_MS = 360;

function MobileCardItem({
  card,
  onLongPress,
}: {
  card: Card;
  onLongPress: (x: number, y: number) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const start = (x: number, y: number) => {
    fired.current = false;
    startPos.current = { x, y };
    timer.current = setTimeout(() => {
      fired.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(20);
      }
      onLongPress(x, y);
    }, LONG_PRESS_MS);
  };

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  };

  // Cancel if finger drifts more than 12px before long-press fires
  const checkDrift = (x: number, y: number) => {
    if (!startPos.current || fired.current) return;
    const dx = x - startPos.current.x;
    const dy = y - startPos.current.y;
    if (Math.hypot(dx, dy) > 12) cancel();
  };

  return (
    <div
      onPointerDown={(e) => start(e.clientX, e.clientY)}
      onPointerMove={(e) => checkDrift(e.clientX, e.clientY)}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        if (fired.current) e.preventDefault();
      }}
      className={cn(
        "select-none rounded-lg border border-rule bg-paper px-3.5 py-3 touch-none",
        "transition active:scale-[0.99] active:bg-paper-2"
      )}
    >
      <div className="font-sans text-[14px] font-medium leading-snug text-ink">{card.name}</div>
      <div className="mt-1 text-[12px] leading-snug text-ink-3">
        <span className="text-ink-mute">→ </span>
        {card.next}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// RadialMoveMenu — gestural radial selector
//
// Long-press on a card triggers this with the touch-down (anchor) coords.
// We render an SVG overlay that:
//   - Tracks the user's current pointer position (line + dot from anchor → finger)
//   - Places 4 destination chips in the cardinal directions around the anchor
//   - Highlights whichever chip the finger is angularly closest to once
//     finger has moved past a small dead-zone
//   - Commits on pointerup if a chip is highlighted, else cancels
//
// Center (within DEAD_ZONE px) → Inbox if from another col, else cancel
// ─────────────────────────────────────────────────────────────────────────
const RADIUS = 110; // chip distance from anchor (px)
const DEAD_ZONE = 28; // px — within this, no direction selected (or → Inbox)
const CHIP_HALF = 50; // chip half-width (min-w 76 + safe padding)
const EDGE_PAD_X = RADIUS + CHIP_HALF; // 160 — left/right edge guard
const EDGE_PAD_TOP = RADIUS + 90; // extra room for "移动到" hint
const EDGE_PAD_BOTTOM = RADIUS + 90; // extra room for footer hint

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function RadialMoveMenu({
  card,
  fromCol,
  anchor,
  onMove,
  onCancel,
}: {
  card: Card;
  fromCol: ColId;
  anchor: { x: number; y: number };
  onMove: (toCol: ColId) => void;
  onCancel: () => void;
}) {
  // Clamp anchor so all 4 chips stay on-screen
  const vw = typeof window !== "undefined" ? window.innerWidth : 375;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const ax = clamp(anchor.x, EDGE_PAD_X, vw - EDGE_PAD_X);
  const ay = clamp(anchor.y, EDGE_PAD_TOP, vh - EDGE_PAD_BOTTOM);

  // Pointer tracking
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: ax, y: ay });
  const [active, setActive] = useState<ColId | null>(null);
  const activeRef = useRef<ColId | null>(null);

  // Lock body + setup global pointer listeners
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const setActiveSync = (a: ColId | null) => {
      activeRef.current = a;
      setActive(a);
    };

    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      const x = e.clientX;
      const y = e.clientY;
      setPointer({ x, y });
      const dx = x - ax;
      const dy = y - ay;
      const mag = Math.hypot(dx, dy);

      if (mag < DEAD_ZONE) {
        // Center zone — Inbox if not currently in inbox, else no target
        setActiveSync(fromCol === "inbox" ? null : "inbox");
        return;
      }

      // Snap to cardinal (4 quadrants of 90° each, rotated so each Q
      // is centered on its axis: top = -π/2, right = 0, bottom = π/2, left = ±π)
      const angle = Math.atan2(dy, dx); // -π..π, 0=right
      let target: ColId;
      if (angle > -3 * Math.PI / 4 && angle < -Math.PI / 4) target = "Q1"; // top
      else if (angle >= -Math.PI / 4 && angle < Math.PI / 4) target = "Q2"; // right
      else if (angle >= Math.PI / 4 && angle < 3 * Math.PI / 4) target = "Q3"; // bottom
      else target = "Q4"; // left

      setActiveSync(target === fromCol ? null : target);
    };

    const handleUp = () => {
      const target = activeRef.current;
      if (target && target !== fromCol) onMove(target);
      else onCancel();
    };

    const handleCancel = () => onCancel();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ax, ay, fromCol]);

  // Chip positions (absolute viewport coords)
  const chips: { id: ColId; cx: number; cy: number }[] = [
    { id: "Q1", cx: ax, cy: ay - RADIUS },
    { id: "Q2", cx: ax + RADIUS, cy: ay },
    { id: "Q3", cx: ax, cy: ay + RADIUS },
    { id: "Q4", cx: ax - RADIUS, cy: ay },
    { id: "inbox", cx: ax, cy: ay }, // center
  ];

  // Active chip's color token — used in footer hint accent
  const activeCol = active ? COL_BY_ID[active] : null;
  const footerText =
    active === null
      ? "拉向方向"
      : active === fromCol
        ? "已在此列"
        : `松手 → ${COL_BY_ID[active].shortLabel} · ${COL_BY_ID[active].sub.split(" · ")[0]}`;

  return (
    <div
      role="dialog"
      aria-label="移动到象限"
      className="fixed inset-0 z-[200] bg-ink/75 backdrop-blur-md fade-in"
      style={{ touchAction: "none" }}
    >
      {/* SVG overlay — origin / guide ring / connecting line / finger dot */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* Guide ring at chip radius — visible enough to read intent */}
        <circle
          cx={ax}
          cy={ay}
          r={RADIUS}
          fill="none"
          stroke="rgba(244,239,230,0.20)"
          strokeWidth="1"
        />
        {/* Dead-zone ring — clearly dashed */}
        <circle
          cx={ax}
          cy={ay}
          r={DEAD_ZONE}
          fill="none"
          stroke="rgba(244,239,230,0.45)"
          strokeWidth="1.25"
          strokeDasharray="4 5"
        />
        {/* Connection line — bright enough to read */}
        <line
          x1={ax}
          y1={ay}
          x2={pointer.x}
          y2={pointer.y}
          stroke="rgba(244,239,230,0.85)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Origin dot */}
        <circle cx={ax} cy={ay} r="5" fill="#F4EFE6" />
        {/* Finger-following dot — accent + soft halo */}
        <circle cx={pointer.x} cy={pointer.y} r="18" fill="rgba(225,74,43,0.18)" />
        <circle cx={pointer.x} cy={pointer.y} r="11" fill="#E14A2B" />
        <circle cx={pointer.x} cy={pointer.y} r="11" fill="none" stroke="#F4EFE6" strokeWidth="1.5" />
      </svg>

      {/* Card name hint — pill on dark backdrop, high contrast */}
      <div
        className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="smallcaps text-paper">移动</div>
        <div className="serif italic mt-1.5 max-w-[80vw] truncate text-[20px] leading-snug text-paper">
          {card.name}
        </div>
      </div>

      {/* Chips at fixed cardinal positions */}
      {chips.map((chip) => {
        const col = COL_BY_ID[chip.id];
        const isFrom = chip.id === fromCol;
        const isActive = active === chip.id;

        // Active chip: solid token bg + white text. Inactive: solid paper bg + ink text.
        // Disabled (fromCol): ink-2 bg + faded.
        const activeBg: Record<ColId, string> = {
          inbox: "bg-ink-2",
          Q1: "bg-tomato",
          Q2: "bg-sage",
          Q3: "bg-plum",
          Q4: "bg-gold",
        };

        return (
          <div
            key={chip.id}
            className={cn(
              "pointer-events-none absolute flex flex-col items-center gap-1.5 rounded-2xl border px-4 py-3 text-center transition-transform duration-100",
              isFrom
                ? "border-paper/10 bg-ink-2/60 opacity-40"
                : isActive
                  ? cn("border-transparent shadow-lift", activeBg[chip.id])
                  : "border-paper/15 bg-paper"
            )}
            style={{
              left: chip.cx,
              top: chip.cy,
              transform: isActive
                ? "translate(-50%, -50%) scale(1.18)"
                : "translate(-50%, -50%)",
              minWidth: 84,
            }}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isActive && !isFrom ? "bg-paper" : col.dot
              )}
              aria-hidden
            />
            <span
              className={cn(
                "serif text-[15px] leading-tight",
                isFrom
                  ? "text-paper/50"
                  : isActive
                    ? "text-paper"
                    : "text-ink"
              )}
            >
              {col.shortLabel}
            </span>
            <span
              className={cn(
                "text-[11px] font-medium leading-tight",
                isFrom
                  ? "text-paper/40"
                  : isActive
                    ? "text-paper/85"
                    : "text-ink-3"
              )}
            >
              {col.id === "inbox" ? "未分类" : col.sub.split(" · ")[0]}
            </span>
          </div>
        );
      })}

      {/* Footer hint — large + accent-color when an action is queued */}
      <div
        className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-center"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div
          className={cn(
            "serif italic text-[18px] leading-snug",
            activeCol && active !== fromCol ? activeCol.text : "text-paper/70"
          )}
        >
          {footerText}
        </div>
        <div className="smallcaps mt-2 text-paper/50">拉回中心或抬手取消</div>
      </div>
    </div>
  );
}
