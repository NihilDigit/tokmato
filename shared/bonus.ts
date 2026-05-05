/**
 * Pure functions for tag-bonus reward computation.
 *
 * A `BonusConfig` defines an open-ended ladder of tiers attached to a
 * single tag. Tier 0 fires at `threshold` pomodoros and awards
 * `initialReward` F. Tier n>=1 fires at `threshold + n*step` pomos and
 * awards `stepReward` F. There is no upper cap — the ladder extrapolates
 * to whatever count the user reaches.
 */

import type { BonusConfig, TagId } from "./types";

/** F awarded by a single bonus when a tag's pomo count crosses from
 *  `prev` to `now` in one transaction. */
export function crossedRewards(
  bonus: BonusConfig,
  prev: number,
  now: number,
): number {
  if (now <= prev) return 0;
  if (now < bonus.threshold) return 0;
  let total = 0;
  if (bonus.threshold > prev && bonus.threshold <= now) {
    total += bonus.initialReward;
  }
  if (bonus.step > 0) {
    for (let n = 1; ; n++) {
      const tier = bonus.threshold + n * bonus.step;
      if (tier > now) break;
      if (tier > prev) total += bonus.stepReward;
    }
  }
  return total;
}

/** Sum F across every bonus attached to `tagId` for a single transition. */
export function totalBonusF(
  bonuses: BonusConfig[],
  tagId: TagId,
  prev: number,
  now: number,
): number {
  return bonuses
    .filter((b) => b.tagId === tagId)
    .reduce((sum, b) => sum + crossedRewards(b, prev, now), 0);
}

/** Enumerate the tier checkpoints up to and including `count` for one
 *  bonus. Used by the SettleSheet recap step to render an animated
 *  ladder. Returned in ascending order. Capped at 50 tiers as a sanity
 *  guard for very small steps relative to large counts. */
export function enumerateTiers(
  bonus: BonusConfig,
  count: number,
): Array<{ tier: number; pomos: number; reward: number; reached: boolean }> {
  const out: Array<{ tier: number; pomos: number; reward: number; reached: boolean }> = [];
  if (bonus.threshold < 0) return out;
  // Tier 0
  out.push({
    tier: 0,
    pomos: bonus.threshold,
    reward: bonus.initialReward,
    reached: count >= bonus.threshold,
  });
  if (bonus.step <= 0) return out;
  for (let n = 1; n < 50; n++) {
    const pomos = bonus.threshold + n * bonus.step;
    // Stop once we're 2 tiers past what the count actually reached — keeps
    // the ladder visually informative without runaway.
    if (pomos > count + 2 * bonus.step) break;
    out.push({
      tier: n,
      pomos,
      reward: bonus.stepReward,
      reached: count >= pomos,
    });
  }
  return out;
}
