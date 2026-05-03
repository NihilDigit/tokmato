"use client";

/**
 * Shared rendering primitives for the account audit views.
 *
 * `LedgerEntryRow` — one entry row with the 4-column layout
 *   amount(9w mono) · kind(7w smallcaps) · note(flex truncate) · time(right)
 *
 * `LedgerDayHeader` — collapsed-state day row with date left + three
 *   net-amount columns (F / H / min) right-aligned in tabular-nums.
 *
 * Both stay style-only; expand / collapse interaction is owned by the
 * containing component (compact accordion vs detail sheet).
 */

import { Fragment } from "react";
import type { TokenLedgerEntry, TagConfig } from "@/lib/types";
import { TAG_TEXT_CLASSES } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

export interface DayTotals {
  fDelta: number;
  hDelta: number;
  minutesDelta: number;
}

export function computeDayTotals(entries: TokenLedgerEntry[]): DayTotals {
  let f = 0;
  let h = 0;
  let m = 0;
  for (const e of entries) {
    f += e.fDelta;
    h += e.hDelta;
    if (typeof e.minutesDelta === "number") m += e.minutesDelta;
  }
  return { fDelta: f, hDelta: h, minutesDelta: m };
}

const KIND_LABEL: Record<TokenLedgerEntry["kind"], string> = {
  welcome: "welcome",
  pomodoro: "pomo",
  settle: "settle",
  recharge: "recharge",
  food: "food",
  wish: "wish",
  play: "play",
  rollup: "rollup",
};

/** Format a delta value to "+1.0" / "-25" with single decimal where
 *  needed. Returns the bare number; the caller appends the unit. */
function fmtDelta(value: number, opts: { intOnly?: boolean } = {}): string {
  const v = opts.intOnly ? Math.round(value) : value;
  const fixed = opts.intOnly ? v.toString() : v.toFixed(1);
  return v > 0 ? `+${fixed}` : `${fixed}`;
}

/** Format the day header date label: "今天 M/D" / "昨天 M/D" / "M/D". */
export function formatDayLabel(dayKey: string, today: string, yesterday: string): string {
  const md = dayKey.slice(5).replace(/^0?(\d+)-0?(\d+)$/, "$1/$2");
  if (dayKey === today) return `今天 ${md}`;
  if (dayKey === yesterday) return `昨天 ${md}`;
  return md;
}

/** Day header row — used both in compact accordion and detail sheet. */
export function LedgerDayHeader({
  label,
  totals,
  trailing,
  className,
}: {
  label: string;
  totals: DayTotals;
  /** Optional trailing element (chevron). */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 px-4 py-3 bg-paper-2/40",
        className,
      )}
    >
      <span className="serif text-[15px] leading-none text-ink">{label}</span>
      <div className="ml-auto flex items-baseline gap-3 mono text-[12px] tabular-nums text-ink-2">
        <NetCell value={totals.fDelta} unit="F" />
        <NetCell value={totals.hDelta} unit="H" />
        <NetCell value={totals.minutesDelta} unit="min" intOnly />
      </div>
      {trailing}
    </div>
  );
}

function NetCell({
  value,
  unit,
  intOnly,
}: {
  value: number;
  unit: string;
  intOnly?: boolean;
}) {
  if (value === 0) {
    return <span className="text-ink-mute w-[60px] text-right">—</span>;
  }
  const text = `${fmtDelta(value, { intOnly })} ${unit}`;
  const tone = value > 0 ? "text-ink" : "text-ink-3";
  return <span className={cn("w-[60px] text-right", tone)}>{text}</span>;
}

/** Format the entry time as `HH:MM` from createdAt. */
function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** One ledger entry row. */
export function LedgerEntryRow({
  entry,
  tagsById,
}: {
  entry: TokenLedgerEntry;
  tagsById: Map<string, TagConfig>;
}) {
  const amount = (() => {
    if (typeof entry.minutesDelta === "number" && entry.fDelta === 0 && entry.hDelta === 0) {
      return { value: entry.minutesDelta, unit: "min", intOnly: true };
    }
    if (entry.hDelta !== 0 && entry.fDelta === 0) {
      return { value: entry.hDelta, unit: "H", intOnly: false };
    }
    if (entry.fDelta !== 0 && entry.hDelta === 0) {
      return { value: entry.fDelta, unit: "F", intOnly: false };
    }
    // Mixed (recharge / wish): show F primarily, render H on a 2nd line via note.
    if (entry.fDelta !== 0) {
      return { value: entry.fDelta, unit: "F", intOnly: false };
    }
    return { value: 0, unit: "F", intOnly: false };
  })();

  const isPositive = amount.value > 0;
  const amountText = `${fmtDelta(amount.value, { intOnly: amount.intOnly })} ${amount.unit}`;
  const amountTone = isPositive ? "text-ink" : "text-ink-3";

  // Note rendering: pomo entries reference a pomodoroRecord we don't have
  // direct access to here, so we show whatever the writer put in `note`.
  // Tag color is applied if the note starts with `#tag` syntax matching
  // a known tag.
  const noteNode = renderNote(entry.note, tagsById);

  // Mixed-deltas adornment (recharge: -2F -1H +30min; wish: -5F -2H).
  const supplementary = (() => {
    const parts: string[] = [];
    if (entry.fDelta !== 0 && entry.hDelta !== 0) {
      parts.push(`${fmtDelta(entry.hDelta)} H`);
    }
    if (
      typeof entry.minutesDelta === "number" &&
      (entry.fDelta !== 0 || entry.hDelta !== 0)
    ) {
      parts.push(`${fmtDelta(entry.minutesDelta, { intOnly: true })} min`);
    }
    return parts.length > 0 ? parts.join(" ") : null;
  })();

  return (
    <div className="grid grid-cols-[88px_70px_1fr_56px] items-baseline gap-3 px-4 py-2 text-[13px]">
      <span className={cn("mono tabular-nums", amountTone)}>{amountText}</span>
      <span className="smallcaps text-ink-3">{KIND_LABEL[entry.kind]}</span>
      <span className="serif truncate text-ink">
        {noteNode}
        {supplementary && (
          <span className="ml-2 mono text-[11px] text-ink-mute">{supplementary}</span>
        )}
      </span>
      <span className="mono tabular-nums text-[12px] text-ink-mute text-right">
        {formatTime(entry.createdAt)}
      </span>
    </div>
  );
}

function renderNote(
  note: string | undefined,
  tagsById: Map<string, TagConfig>,
): React.ReactNode {
  if (!note) return null;
  // If note starts with "#tag" and the rest is space-separated, color
  // the tag chip. Otherwise plain.
  const match = /^#(\S+)(\s+.*)?$/.exec(note);
  if (!match) return note;
  const tagId = match[1];
  const rest = match[2] ?? "";
  const tag = tagsById.get(tagId);
  if (!tag) return note;
  return (
    <Fragment>
      <span className={cn("font-mono", TAG_TEXT_CLASSES[tag.color])}>#{tag.label.replace(/^#/, "")}</span>
      <span>{rest}</span>
    </Fragment>
  );
}
