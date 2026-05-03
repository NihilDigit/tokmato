/**
 * Pure helpers over the token ledger (`UserState.tokenHistory`).
 *
 * - `recomputeBalances` — sum F / H / minutes deltas across the ledger.
 *   Used by the merge-time drift sanity check; not the live source of
 *   truth for balances (which stay on the store fields).
 * - `dedupWelcomeEntries` — single-user invariant: at most ONE welcome
 *   entry. Multi-welcome happens when a per-browser anon grant collides
 *   with a previously cloud-recorded welcome on auth-merge. Drop the
 *   later ones, return their summed deltas so the caller can reverse
 *   them out of the merged balance.
 * - `rolledUpEntries` — collapse all entries older than `cutoffMs` into
 *   one `kind:"rollup"` per dayKey with summed deltas. Idempotent —
 *   re-running after entries have already been rolled up is a no-op.
 *   Stable id `rollup-{dayKey}` ensures merge across devices dedups
 *   the same day's rollup correctly.
 */

import type { TokenLedgerEntry } from "./types";

const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

export interface BalanceTotals {
  ftoken: number;
  htoken: number;
  timePool: number;
}

export function recomputeBalances(entries: TokenLedgerEntry[]): BalanceTotals {
  let f = 0;
  let h = 0;
  let m = 0;
  for (const e of entries) {
    f += e.fDelta;
    h += e.hDelta;
    if (typeof e.minutesDelta === "number") m += e.minutesDelta;
  }
  return { ftoken: round(f), htoken: round(h), timePool: round(m, 0) };
}

export interface WelcomeDedupResult {
  entries: TokenLedgerEntry[];
  fAdjust: number;
  hAdjust: number;
}

/** Keep the earliest-created welcome entry; drop the rest. Returns the
 *  filtered entries plus the negated summed deltas of dropped welcomes
 *  so the caller can subtract them from the merged balance. */
export function dedupWelcomeEntries(
  entries: TokenLedgerEntry[],
): WelcomeDedupResult {
  const welcomes = entries.filter((e) => e.kind === "welcome");
  if (welcomes.length <= 1) {
    return { entries, fAdjust: 0, hAdjust: 0 };
  }
  // Sort by createdAt ascending; keep [0], drop the rest.
  const sorted = [...welcomes].sort((a, b) => a.createdAt - b.createdAt);
  const keepId = sorted[0].id;
  const dropped = sorted.slice(1);
  const fAdjust = round(-dropped.reduce((s, e) => s + e.fDelta, 0));
  const hAdjust = round(-dropped.reduce((s, e) => s + e.hDelta, 0));
  const droppedIds = new Set(dropped.map((e) => e.id));
  const filtered = entries.filter(
    (e) => e.kind !== "welcome" || e.id === keepId || !droppedIds.has(e.id),
  );
  return { entries: filtered, fAdjust, hAdjust };
}

/** Compute rollup id for a given dayKey. Stable across devices so
 *  merge dedups identically. */
export function rollupIdFor(dayKey: string): string {
  return `rollup-${dayKey}`;
}

/** Collapse entries with `createdAt < cutoffMs` into one rollup per
 *  dayKey. Younger entries pass through untouched. Idempotent: existing
 *  rollups in the input get folded into the recomputed rollups
 *  (their deltas re-summed). */
export function rolledUpEntries(
  entries: TokenLedgerEntry[],
  cutoffMs: number,
): TokenLedgerEntry[] {
  const young: TokenLedgerEntry[] = [];
  const oldByDay = new Map<string, TokenLedgerEntry[]>();
  for (const e of entries) {
    if (e.createdAt < cutoffMs) {
      const arr = oldByDay.get(e.dayKey) ?? [];
      arr.push(e);
      oldByDay.set(e.dayKey, arr);
    } else {
      young.push(e);
    }
  }
  if (oldByDay.size === 0) return entries;
  const rollups: TokenLedgerEntry[] = [];
  for (const [dayKey, dayEntries] of oldByDay) {
    let f = 0;
    let h = 0;
    let m = 0;
    let minTs = Infinity;
    for (const e of dayEntries) {
      f += e.fDelta;
      h += e.hDelta;
      if (typeof e.minutesDelta === "number") m += e.minutesDelta;
      if (e.createdAt < minTs) minTs = e.createdAt;
    }
    rollups.push({
      id: rollupIdFor(dayKey),
      kind: "rollup",
      fDelta: round(f),
      hDelta: round(h),
      minutesDelta: m === 0 ? undefined : round(m, 0),
      createdAt: minTs === Infinity ? cutoffMs : minTs,
      dayKey,
    });
  }
  // Sort rollups newest first (so they appear above even older days
  // when the array is consumed in order).
  rollups.sort((a, b) => b.createdAt - a.createdAt);
  // Merge: rollups go after the young entries (which are already in
  // newest-first order by store convention).
  return [...young, ...rollups];
}
