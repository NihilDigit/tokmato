"use client";

/**
 * LedgerSheet — full token-flow audit view.
 *
 * Multi-expand collapsible per day. Filter pills (全部 / 进项 / 消费)
 * narrow the entries shown AND recompute the per-day net.
 *
 * Single scroll container: ResponsiveSheet's mobile bottom-sheet is
 * already `max-h-[90dvh] overflow-y-auto`. Day collapsible bodies
 * expand inline; never nest overflow-y inside.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { todayKey, yesterdayKey, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  computeDayTotals,
  formatDayLabel,
  LedgerDayHeader,
  LedgerEntryRow,
} from "@/components/ledger/LedgerRow";
import type { TagConfig, TokenLedgerEntry } from "@/lib/types";

export interface LedgerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Filter = "all" | "income" | "spend";

export function LedgerSheet({ open, onOpenChange }: LedgerSheetProps) {
  const tokenHistory = useStore((s) => s.tokenHistory);
  const tags = useStore((s) => s.tags);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tagsById = useMemo(() => {
    const m = new Map<string, TagConfig>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const today = todayKey();
  const yesterday = yesterdayKey();

  // Group entries by dayKey, separating live vs rollup days.
  const grouped = useMemo(() => {
    const filtered = tokenHistory.filter((e) => {
      if (filter === "all") return true;
      const positive = e.fDelta > 0 || e.hDelta > 0 || (e.minutesDelta ?? 0) > 0;
      const negative = e.fDelta < 0 || e.hDelta < 0 || (e.minutesDelta ?? 0) < 0;
      if (filter === "income") return positive;
      if (filter === "spend") return negative;
      return true;
    });
    const live: { dayKey: string; entries: TokenLedgerEntry[] }[] = [];
    const rollups: TokenLedgerEntry[] = [];
    const liveIndex = new Map<string, TokenLedgerEntry[]>();
    for (const e of filtered) {
      if (e.kind === "rollup") {
        rollups.push(e);
        continue;
      }
      const arr = liveIndex.get(e.dayKey) ?? [];
      arr.push(e);
      liveIndex.set(e.dayKey, arr);
    }
    for (const [dayKey, entries] of liveIndex) {
      live.push({ dayKey, entries });
    }
    // Newest day first (entries are already newest-first within a day).
    live.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
    rollups.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
    return { live, rollups };
  }, [tokenHistory, filter]);

  const toggleDay = (dayKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="账本"
      desktopWidthClass="sm:max-w-[700px]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
            全部
          </FilterPill>
          <FilterPill active={filter === "income"} onClick={() => setFilter("income")}>
            进项
          </FilterPill>
          <FilterPill active={filter === "spend"} onClick={() => setFilter("spend")}>
            消费
          </FilterPill>
        </div>

        <div className="flex flex-col rounded-xl border border-rule overflow-hidden">
          {grouped.live.length === 0 && grouped.rollups.length === 0 && (
            <div className="px-5 py-8 text-center text-[13px] text-ink-3">
              账本还没有条目
            </div>
          )}
          {grouped.live.map(({ dayKey, entries }, idx) => {
            const totals = computeDayTotals(entries);
            const isOpen = expanded.has(dayKey);
            return (
              <div key={dayKey} className={cn(idx > 0 && "border-t border-rule")}>
                <button
                  type="button"
                  onClick={() => toggleDay(dayKey)}
                  className="w-full text-left transition-colors hover:bg-paper-2/60"
                >
                  <LedgerDayHeader
                    label={formatDayLabel(dayKey, today, yesterday)}
                    totals={totals}
                    trailing={
                      isOpen ? (
                        <ChevronDown size={14} className="text-ink-3 ml-2" />
                      ) : (
                        <ChevronRight size={14} className="text-ink-3 ml-2" />
                      )
                    }
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-rule">
                    {entries.map((e) => (
                      <LedgerEntryRow key={e.id} entry={e} tagsById={tagsById} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {grouped.rollups.length > 0 && (
            <>
              <div className="border-t border-rule bg-paper-2/40 py-2 text-center smallcaps text-ink-3">
                存档
              </div>
              {grouped.rollups.map((r, i) => (
                <div
                  key={r.id}
                  className={cn(i > 0 && "border-t border-rule")}
                >
                  <LedgerDayHeader
                    label={formatDayLabel(r.dayKey, today, yesterday)}
                    totals={computeDayTotals([r])}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-transparent bg-ink text-paper"
          : "border-rule text-ink-3 hover:border-ink/30 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
