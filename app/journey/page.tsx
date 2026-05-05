"use client";

import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayKey, yesterdayKey, useStore } from "@/lib/store";
import { TAG_BG_CLASSES, TAG_CHIP_CLASSES } from "@/lib/tag-colors";
import type { TagColor, TagConfig, TokenLedgerEntry } from "@/lib/types";
import {
  computeDayTotals,
  formatDayLabel,
  LedgerDayHeader,
  LedgerEntryRow,
} from "@/components/ledger/LedgerRow";
import { LedgerSheet } from "@/components/sheets/LedgerSheet";

// ─────────────────────────────────────────────────────────────────────────
// Journey — 年度回顾
// 信息密度：标题 + 5 stats + heatmap (52×7) + 学科分布 + 最近 20 串
// 当前只展示本地 store 已有的真实记录；没有历史表时保持空态。
// ─────────────────────────────────────────────────────────────────────────

const HEATMAP_OPACITY = [5, 18, 40, 65, 95] as const;

/** Map TagColor → CSS var ref for SVG fill (Donut needs concrete color
 *  values, not Tailwind classes). Mirrors TAG_BG_CLASSES key set. */
const TAG_FILL_VAR: Record<TagColor, string> = {
  tomato: "var(--tomato)",
  sage: "var(--sage)",
  teal: "var(--teal)",
  gold: "var(--gold)",
  plum: "var(--plum)",
  ocean: "var(--ocean)",
  moss: "var(--moss)",
  amber: "var(--amber)",
  rose: "var(--rose)",
  slate: "var(--slate)",
};

export default function JourneyPage() {
  const { pomodoroHistory, tokenHistory, tags } = useStore(
    useShallow((s) => ({
      pomodoroHistory: s.pomodoroHistory,
      tokenHistory: s.tokenHistory,
      tags: s.tags,
    })),
  );

  const last30Keys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 29; i >= 0; i--) {
      keys.push(todayKey(new Date(Date.now() - i * 86400000)));
    }
    return keys;
  }, []);

  // "all" = no tag filter; otherwise filter pomodoros by tag id.
  // Distribution donut still computes from the unfiltered set so the
  // breakdown always shows the full picture; heatmap + recent strings
  // narrow to the selected tag.
  const [activeTag, setActiveTag] = useState<string>("all");

  const recentRecordsAll = useMemo(
    () => pomodoroHistory.filter((r) => last30Keys.includes(r.dayKey)),
    [last30Keys, pomodoroHistory],
  );
  const recentRecords = useMemo(
    () =>
      activeTag === "all"
        ? recentRecordsAll
        : recentRecordsAll.filter((r) => r.tag === activeTag),
    [recentRecordsAll, activeTag],
  );
  const recentTokens = useMemo(
    () => tokenHistory.filter((r) => last30Keys.includes(r.dayKey)),
    [last30Keys, tokenHistory],
  );

  // Stats + distribution always reflect the full 30 days regardless of
  // the active tag filter — they're the "at a glance" summary, not the
  // narrowed view.
  const stats = {
    totalPomos: recentRecordsAll.reduce((sum, r) => sum + r.count, 0),
    totalHours: recentRecordsAll.reduce((sum, r) => sum + r.minutes, 0) / 60,
    totalF: recentTokens.reduce((sum, r) => sum + Math.max(0, r.fDelta), 0),
    totalH: recentTokens.reduce((sum, r) => sum + Math.max(0, r.hDelta), 0),
  };

  // Trend chart = daily closing balances, not daily income. A line chart
  // should show a state over time; tokenHistory deltas are folded into
  // closing F/H balances.
  const balanceTrend = useMemo(
    () => buildBalanceTrend(tokenHistory, last30Keys),
    [tokenHistory, last30Keys],
  );

  const distribution: { tag: TagConfig; count: number; pct: number }[] = useMemo(() => {
    const total = recentRecordsAll.reduce((sum, r) => sum + r.count, 0);
    if (total <= 0) {
      return tags.map((t) => ({ tag: t, count: 0, pct: 0 }));
    }
    const counts: Record<string, number> = recentRecordsAll.reduce(
      (acc: Record<string, number>, r) => {
        acc[r.tag] = (acc[r.tag] ?? 0) + r.count;
        return acc;
      },
      {},
    );
    return tags.map((t) => ({
      tag: t,
      count: counts[t.id] ?? 0,
      pct: ((counts[t.id] ?? 0) / total) * 100,
    }));
  }, [recentRecordsAll, tags]);

  const heatmapCounts = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const record of recentRecords) {
      byDay.set(record.dayKey, (byDay.get(record.dayKey) ?? 0) + record.count);
    }
    return last30Keys.map((key) => byDay.get(key) ?? 0);
  }, [last30Keys, recentRecords]);

  const tagById = useMemo(() => {
    const m = new Map<string, TagConfig>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const heatmapToneClass = useMemo(() => {
    if (activeTag === "all") return "bg-tomato";
    const t = tagById.get(activeTag);
    return t ? TAG_BG_CLASSES[t.color] : "bg-tomato";
  }, [activeTag, tagById]);

  const recentStrings = recentRecords.slice(0, 20).map((record) => ({
    task: record.result || record.task,
    tag: tagById.get(record.tag),
    tagRaw: record.tag,
    count: record.count,
    mins: record.minutes,
    date: formatRecordTime(record.endedAt),
  }));

  return (
    <main className="flex flex-col gap-10">
      {/* Editorial title — h2 cap, single tomato accent on the number */}
      <header className="flex flex-col gap-2">
        <div className="smallcaps">过去 30 天</div>
        <h1 className="serif italic text-h2 leading-tight text-ink">
          你做了 <span className="text-tomato">{stats.totalPomos.toLocaleString()}</span> 个番茄。
        </h1>
      </header>

      {/* 4 stats — hairline-divided. 2 cols mobile, 4 cols on wide */}
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule wide:grid-cols-4">
        <BalanceCell kicker="番茄" value={stats.totalPomos.toLocaleString()} />
        <BalanceCell kicker="学习" value={stats.totalHours.toFixed(1)} unit="h" />
        <BalanceCell
          kicker="FToken"
          value={stats.totalF.toLocaleString()}
          unit="◆"
          color="text-tomato"
        />
        <BalanceCell
          kicker="HToken"
          value={stats.totalH.toLocaleString()}
          unit="❖"
          color="text-sage"
        />
      </section>

      <TrendSection
        fSeries={balanceTrend.f}
        hSeries={balanceTrend.h}
      />

      {/* Heatmap (left 50%) + Donut (right 50%) — single visual section */}
      <section className="flex flex-col gap-4">
        <SectionHead title="30 天的痕迹" />

        {/* Tag filter — narrows heatmap + recent strings to one tag. */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition",
              activeTag === "all"
                ? "border-transparent bg-ink text-paper"
                : "border-rule text-ink-3 hover:border-ink/30 hover:text-ink",
            )}
          >
            全部
          </button>
          {tags.map((t) => {
            const active = activeTag === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTag(t.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-mono transition",
                  active
                    ? cn("border-transparent", TAG_CHIP_CLASSES[t.color])
                    : "border-rule text-ink-3 hover:border-ink/30 hover:text-ink",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 wide:grid-cols-2">
          {/* Left: heatmap (tone follows the active filter) */}
          <div className="rounded-xl border border-rule bg-paper p-5">
            <Heatmap toneClass={heatmapToneClass} counts={heatmapCounts} />
            <div className="mono mt-3.5 flex items-center justify-between text-[11px] text-ink-mute">
              <span>30 天前</span>
              <div className="flex items-center gap-1.5">
                <span>少</span>
                {HEATMAP_OPACITY.map((op, i) => (
                  <span
                    key={i}
                    className={cn("h-2.5 w-2.5 rounded-[2px]", heatmapToneClass)}
                    style={{ opacity: op / 100 }}
                  />
                ))}
                <span>多</span>
              </div>
              <span>今天</span>
            </div>
          </div>

          {/* Right: donut distribution */}
          <div className="flex items-center gap-6 rounded-xl border border-rule bg-paper p-5">
            <Donut data={distribution} />
            <ul className="flex flex-col gap-2.5">
              {distribution.map((d) => (
                <li key={d.tag.id} className="flex items-center gap-2">
                  <span
                    className={cn("h-2.5 w-2.5 rounded-[2px]", TAG_BG_CLASSES[d.tag.color])}
                    aria-hidden
                  />
                  <span className="mono text-xs text-ink-3">{d.tag.label}</span>
                  <span className="serif text-base leading-none text-ink">
                    {formatPct(d.pct)}
                    <span className="ml-0.5 text-[11px] text-ink-3">%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Recent strings */}
      <section className="flex flex-col gap-4">
        <SectionHead
          kicker="最近 20 串"
          title="脚印"
          right={
            <button
              type="button"
              onClick={() => exportJourneyJson(recentRecords)}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-1.5 text-[13px] text-ink-2 transition hover:border-ink/30 hover:text-ink"
            >
              <Download size={13} />
              导出 JSON
            </button>
          }
        />

        <div className="overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="max-h-[520px] overflow-y-auto">
            {recentStrings.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-ink-3">
                番茄结束后会出现在这里
              </p>
            ) : recentStrings.map((r, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 sm:gap-6 sm:px-6",
                  i > 0 && "border-t border-rule"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "mono inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px]",
                      r.tag
                        ? TAG_CHIP_CLASSES[r.tag.color]
                        : "border border-dashed border-rule text-ink-mute",
                    )}
                  >
                    {r.tag?.label ?? r.tagRaw}
                  </span>
                  <span className="serif truncate text-base text-ink sm:text-[17px]">
                    {r.task}
                  </span>
                </div>
                <span className="mono text-[13px] text-ink-3">{r.count} 番</span>
                <span className="mono text-[13px] text-ink-3">{r.mins}m</span>
                <span className="min-w-[70px] text-right text-xs text-ink-mute sm:min-w-[80px]">
                  {r.date}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <LedgerCompactSection />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 账本 — compact 3-day single-open accordion + ScrollableList(4)
// ─────────────────────────────────────────────────────────────────────────

function LedgerCompactSection() {
  const { tokenHistory, tags } = useStore(
    useShallow((s) => ({
      tokenHistory: s.tokenHistory,
      tags: s.tags,
    })),
  );
  const tagsById = useMemo(() => {
    const m = new Map<string, TagConfig>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  // Most recent 3 days that have any non-rollup activity.
  const recentDays = useMemo(() => {
    const byDay = new Map<string, TokenLedgerEntry[]>();
    for (const e of tokenHistory) {
      if (e.kind === "rollup") continue;
      const arr = byDay.get(e.dayKey) ?? [];
      arr.push(e);
      byDay.set(e.dayKey, arr);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 3)
      .map(([dayKey, entries]) => ({ dayKey, entries }));
  }, [tokenHistory]);

  const today = todayKey();
  const yesterday = yesterdayKey();
  const defaultExpand = recentDays[0]?.dayKey ?? null;
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const effectiveExpand = expandedDayKey ?? defaultExpand;
  const [sheetOpen, setSheetOpen] = useState(false);

  if (recentDays.length === 0) {
    // No content yet — hide the section entirely.
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHead kicker="最近 3 天" title="账本" />

      <div
        className="rounded-xl border border-rule bg-paper overflow-hidden"
        style={{ height: "320px" }}
      >
        <div className="flex flex-col h-full">
          {recentDays.map(({ dayKey, entries }, idx) => {
            const totals = computeDayTotals(entries);
            const isOpen = effectiveExpand === dayKey;
            return (
              <div
                key={dayKey}
                className={cn(
                  "flex flex-col",
                  idx > 0 && "border-t border-rule",
                  isOpen && "flex-1 min-h-0",
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedDayKey(
                      expandedDayKey === dayKey ? defaultExpand : dayKey,
                    )
                  }
                  aria-expanded={isOpen}
                  aria-controls={`ledger-compact-day-${dayKey}`}
                  className="text-left transition-colors hover:bg-paper-2/60"
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
                  <div
                    id={`ledger-compact-day-${dayKey}`}
                    className="border-t border-rule overflow-y-auto flex-1 min-h-0"
                  >
                    {entries.map((e) => (
                      <LedgerEntryRow key={e.id} entry={e} tagsById={tagsById} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="text-[13px] text-ink-3 hover:text-ink transition-colors"
        >
          完整账本 →
        </button>
      </div>

      <LedgerSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// In-file primitives
// ─────────────────────────────────────────────────────────────────────────

function BalanceCell({
  kicker,
  value,
  unit,
  color,
}: {
  kicker: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  // tailwind-merge groups `text-stat` (font-size token) and `text-tomato`
  // (color token) under the same `text-*` family and dedupes one of them.
  // Bypass cn() here so the size utility survives next to the color utility.
  const valueClass = `serif text-stat leading-none${color ? " " + color : ""}`;
  const kickerClass = `smallcaps${color ? " " + color : ""}`;
  return (
    <div className="flex flex-col gap-1.5 bg-paper p-5">
      <div className={kickerClass}>{kicker}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={valueClass}>{value}</span>
        {unit && <span className="text-[13px] text-ink-3">{unit}</span>}
      </div>
    </div>
  );
}

function SectionHead({
  kicker,
  title,
  right,
}: {
  kicker?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <div className="smallcaps mb-1.5">{kicker}</div>}
        <h2 className="serif italic text-h3 leading-tight text-ink">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function formatRecordTime(time: number) {
  const d = new Date(time);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000);
  const label = sameDay
    ? "今天"
    : d.toDateString() === yesterday.toDateString()
      ? "昨天"
      : `${d.getMonth() + 1}/${d.getDate()}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${label} ${hh}:${mm}`;
}

function formatPct(pct: number) {
  if (pct <= 0) return "0";
  if (pct >= 99.5) return "100";
  return pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function buildBalanceTrend(entries: TokenLedgerEntry[], dayKeys: string[]) {
  let f = 0;
  let h = 0;
  const byDay = new Map<string, TokenLedgerEntry[]>();
  const firstDay = dayKeys[0];

  for (const entry of entries) {
    if (firstDay && entry.dayKey < firstDay) {
      f += entry.fDelta;
      h += entry.hDelta;
      continue;
    }
    const bucket = byDay.get(entry.dayKey) ?? [];
    bucket.push(entry);
    byDay.set(entry.dayKey, bucket);
  }

  const fSeries: number[] = [];
  const hSeries: number[] = [];

  for (const dayKey of dayKeys) {
    for (const entry of byDay.get(dayKey) ?? []) {
      f += entry.fDelta;
      h += entry.hDelta;
    }
    const fBalance = Math.max(0, round1(f));
    const hBalance = Math.max(0, round1(h));
    fSeries.push(fBalance);
    hSeries.push(hBalance);
  }

  return { f: fSeries, h: hSeries };
}

function exportJourneyJson(records: unknown[]) {
  const blob = new Blob([JSON.stringify(records, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tokmato-journey-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Trend — daily closing balances. 7d / 30d toggle.
// Series come pre-sliced as the full 30-day arrays (oldest → today);
// this component just tail-slices to 7 when needed.
function TrendSection({
  fSeries,
  hSeries,
}: {
  fSeries: number[];
  hSeries: number[];
}) {
  const [range, setRange] = useState<7 | 30>(30);
  const f = range === 7 ? fSeries.slice(-7) : fSeries;
  const h = range === 7 ? hSeries.slice(-7) : hSeries;

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        kicker="F · H"
        title="余额"
        right={
          <div className="inline-flex gap-1.5">
            {[7, 30].map((n) => {
              const active = range === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRange(n as 7 | 30)}
                  className={cn(
                    "mono rounded-full border px-3 py-1 text-xs transition",
                    active
                      ? "border-transparent bg-ink text-paper"
                      : "border-rule text-ink-3 hover:border-ink/30 hover:text-ink",
                  )}
                >
                  {n} 天
                </button>
              );
            })}
          </div>
        }
      />

      <div className="rounded-xl border border-rule bg-paper p-5">
        <TrendChart fSeries={f} hSeries={h} />
        <div className="mono mt-3.5 flex items-center justify-between text-[11px] text-ink-mute">
          <span>{range} 天前</span>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-tomato" aria-hidden />F
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sage" aria-hidden />H
            </span>
          </div>
          <span>今天</span>
        </div>
      </div>
    </section>
  );
}

function TrendChart({
  fSeries,
  hSeries,
}: {
  fSeries: number[];
  hSeries: number[];
}) {
  const N = Math.max(fSeries.length, hSeries.length, 1);
  const fValues = normalizeSeries(fSeries, N);
  const hValues = normalizeSeries(hSeries, N);
  const W = 600;
  const H = 160;
  const pad = { l: 32, r: 16, t: 14, b: 10 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const tokenMax = Math.max(0, ...fValues, ...hValues);
  const noData = tokenMax <= 0;
  const max = Math.max(1, tokenMax);
  // Round max up to a "nice" tick so the y-axis label reads as a clean
  // integer rather than a noisy actual maximum.
  const niceMax = niceCeil(max);

  const xAt = (i: number) =>
    pad.l + (N <= 1 ? iw / 2 : (i / (N - 1)) * iw);
  const yAt = (v: number) => pad.t + (1 - v / niceMax) * ih;

  const buildPath = (series: number[]) =>
    series
      .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`)
      .join(" ");
  const buildArea = (series: number[]) => {
    const last = series.length - 1;
    return `${buildPath(series)} L ${xAt(last)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`;
  };

  const fPath = buildPath(fValues);
  const hPath = buildPath(hValues);
  const fArea = buildArea(fValues);
  const hArea = buildArea(hValues);

  const ariaLabel = noData
    ? "余额：暂无 F / H"
    : `余额：当前 F ${fValues.at(-1) ?? 0}，H ${hValues.at(-1) ?? 0}`;

  // 7d view shows dots (each day matters); 30d view drops them so the
  // line itself is the signal and dots don't crowd into noise.
  const showDots = N <= 7;
  const dotR = 3.5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={ariaLabel}
    >
      {/* baseline + max gridline */}
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={yAt(0)}
        y2={yAt(0)}
        stroke="var(--rule)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={yAt(niceMax)}
        y2={yAt(niceMax)}
        stroke="var(--rule)"
        strokeWidth={1}
        strokeDasharray="2 4"
        vectorEffect="non-scaling-stroke"
      />

      {/* y-axis labels: 0 (baseline) and niceMax */}
      <text
        x={pad.l - 6}
        y={yAt(0)}
        dy="0.32em"
        textAnchor="end"
        fontSize="10"
        fill="var(--ink-mute)"
        fontFamily="var(--font-mono, ui-monospace)"
      >
        0
      </text>
      <text
        x={pad.l - 6}
        y={yAt(niceMax)}
        dy="0.32em"
        textAnchor="end"
        fontSize="10"
        fill="var(--ink-mute)"
        fontFamily="var(--font-mono, ui-monospace)"
      >
        {niceMax}
      </text>
      {noData ? (
        <text
          x={pad.l + iw / 2}
          y={pad.t + ih / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="13"
          fill="var(--ink-mute)"
          fontFamily="var(--font-sans, ui-sans-serif)"
        >
          暂无 F / H 余额
        </text>
      ) : (
        <>
          {/* areas — drawn first so lines sit on top */}
          <path d={hArea} fill="var(--sage)" opacity={0.1} />
          <path d={fArea} fill="var(--tomato)" opacity={0.1} />

          {/* lines */}
          <path
            d={hPath}
            stroke="var(--sage)"
            strokeWidth={1.6}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={fPath}
            stroke="var(--tomato)"
            strokeWidth={1.6}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* dots — only on 7d view */}
          {showDots && (
            <>
              {hValues.map((v, i) => (
                <circle
                  key={`h-${i}`}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={dotR}
                  fill="var(--sage)"
                >
                  <title>{`${N - 1 - i} 天前 · H ${v}`}</title>
                </circle>
              ))}
              {fValues.map((v, i) => (
                <circle
                  key={`f-${i}`}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={dotR}
                  fill="var(--tomato)"
                >
                  <title>{`${N - 1 - i} 天前 · F ${v}`}</title>
                </circle>
              ))}
            </>
          )}
        </>
      )}
    </svg>
  );
}

function niceCeil(value: number) {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / pow) * pow;
}

function normalizeSeries(series: number[], length: number) {
  return Array.from({ length }, (_, i) => {
    const value = series[i] ?? 0;
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  });
}

function Donut({
  data,
  size = 140,
  thickness = 24,
}: {
  data: { tag: TagConfig; count: number; pct: number }[];
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const circumference = 2 * Math.PI * r;
  const nonZero = data.filter((d) => d.count > 0);

  // Build a one-line summary for the SVG aria-label so screen readers
  // get the distribution at a glance: "math 40%, cs 25%, english 20%, ..."
  const summary = data
    .filter((d) => d.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .map((d) => `${d.tag.label} ${formatPct(d.pct)}%`)
    .join("，");
  const ariaLabel = summary ? `tag 分布：${summary}` : "tag 分布：暂无数据";
  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--rule)"
        strokeWidth={thickness}
      />
      {nonZero.map((d) => {
        const dash = nonZero.length === 1 ? circumference : (d.count / total) * circumference;
        const circle = (
          <circle
            key={d.tag.id}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={TAG_FILL_VAR[d.tag.color]}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>{`${d.tag.label} ${formatPct(d.pct)}%`}</title>
          </circle>
        );
        offset += dash;
        return circle;
      })}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        fill={total > 0 ? "var(--ink)" : "var(--ink-mute)"}
        fontFamily="var(--font-mono, ui-monospace)"
      >
        {total}
      </text>
    </svg>
  );
}

// Heatmap — past 30 days as a 3 rows × 10 cols grid of small squares.
// Reading order = time order: top-left = 29 days ago, bottom-right = today.
// `toneClass` is a Tailwind bg class string (e.g. "bg-tomato"); each cell
// stacks an opacity from the level ladder.
function Heatmap({ toneClass, counts }: { toneClass: string; counts: number[] }) {
  const ROWS = 3;
  const COLS = 10;
  const TOTAL = ROWS * COLS; // 30
  const tone = toneClass;

  const today = new Date();

  return (
    <div
      role="grid"
      aria-label="过去 30 天番茄分布热力图"
      className="grid gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {Array.from({ length: TOTAL }).map((_, i) => {
        // i = 0 → 29 days ago (top-left); i = 29 → today (bottom-right)
        const dayIndex = TOTAL - 1 - i;
        const pomos = counts[i] ?? 0;
        const level =
          pomos >= 7 ? 4 : pomos >= 4 ? 3 : pomos >= 2 ? 2 : pomos >= 1 ? 1 : 0;
        const isEmpty = level === 0;

        const date = new Date(today.getTime() - dayIndex * 86400000);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}/${mm}/${dd}`;
        const cellLabel = `${dateStr}，${pomos} 个番茄`;

        return (
          <div
            key={i}
            role="gridcell"
            aria-label={cellLabel}
            title={cellLabel}
            className={cn(
              "aspect-square cursor-help rounded-[2px]",
              isEmpty ? "bg-ink" : tone
            )}
            style={{ opacity: HEATMAP_OPACITY[level] / 100 }}
          />
        );
      })}
    </div>
  );
}
