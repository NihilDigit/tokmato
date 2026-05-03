import { describe, expect, it } from "bun:test";
import { crossedRewards, totalBonusF, enumerateTiers } from "./bonus";
import type { BonusConfig } from "./types";

const mathLikeBonus: BonusConfig = {
  id: "b-test",
  tagId: "math",
  threshold: 5,
  initialReward: 1,
  step: 2,
  stepReward: 1,
};

describe("crossedRewards", () => {
  it("awards initial reward when prev<threshold and now>=threshold", () => {
    expect(crossedRewards(mathLikeBonus, 4, 6)).toBe(1);
  });

  it("returns 0 when now is below threshold", () => {
    expect(crossedRewards(mathLikeBonus, 0, 4)).toBe(0);
  });

  it("returns 0 when prev>=threshold but no further tier crossed", () => {
    expect(crossedRewards(mathLikeBonus, 5, 6)).toBe(0);
  });

  it("returns initial + (n-1)*step when crossing threshold + multiple tiers", () => {
    // 0 → 9: tier 0 (5), tier 1 (7), tier 2 (9) — initial + 2 step
    expect(crossedRewards(mathLikeBonus, 0, 9)).toBe(3);
  });

  it("extrapolates past the legacy v1.7 cap of 11 (tier 4 = 13 still fires)", () => {
    expect(crossedRewards(mathLikeBonus, 11, 13)).toBe(1);
  });

  it("treats step=0 as a single-tier ladder (only the threshold)", () => {
    const flat: BonusConfig = { ...mathLikeBonus, step: 0 };
    expect(crossedRewards(flat, 4, 100)).toBe(1);
    expect(crossedRewards(flat, 5, 100)).toBe(0);
  });

  it("returns 0 when now <= prev", () => {
    expect(crossedRewards(mathLikeBonus, 10, 10)).toBe(0);
    expect(crossedRewards(mathLikeBonus, 10, 8)).toBe(0);
  });

  it("uses stepReward (not initialReward) for tier n>=1", () => {
    const asym: BonusConfig = {
      ...mathLikeBonus,
      initialReward: 5,
      stepReward: 1,
    };
    // 0 → 7: tier 0 (=5 reward) + tier 1 (=1 reward)
    expect(crossedRewards(asym, 0, 7)).toBe(6);
  });
});

describe("totalBonusF", () => {
  const englishBonus: BonusConfig = {
    id: "b-eng",
    tagId: "english",
    threshold: 8,
    initialReward: 2,
    step: 4,
    stepReward: 1,
  };

  it("only sums bonuses for the matching tag", () => {
    expect(totalBonusF([mathLikeBonus, englishBonus], "math", 4, 6)).toBe(1);
    expect(totalBonusF([mathLikeBonus, englishBonus], "english", 7, 8)).toBe(2);
  });

  it("returns 0 when no bonus targets the tag", () => {
    expect(totalBonusF([mathLikeBonus], "english", 0, 100)).toBe(0);
  });

  it("sums multiple bonuses on the same tag", () => {
    const a: BonusConfig = {
      id: "a",
      tagId: "cs",
      threshold: 3,
      initialReward: 1,
      step: 0,
      stepReward: 0,
    };
    const b: BonusConfig = {
      id: "b",
      tagId: "cs",
      threshold: 6,
      initialReward: 2,
      step: 0,
      stepReward: 0,
    };
    expect(totalBonusF([a, b], "cs", 0, 6)).toBe(3);
  });
});

describe("enumerateTiers", () => {
  it("emits tier 0 only when count is below threshold", () => {
    const tiers = enumerateTiers(mathLikeBonus, 0);
    expect(tiers).toEqual([
      { tier: 0, pomos: 5, reward: 1, reached: false },
    ]);
  });

  it("marks tiers as reached up to and including count, then stops two tiers ahead", () => {
    const tiers = enumerateTiers(mathLikeBonus, 9);
    // count=9 → tier 0 (5), tier 1 (7), tier 2 (9) reached, then 2 ahead
    // (tier 3 = 11, tier 4 = 13). Stop condition is pomos > count + 2*step
    // (= 9 + 4 = 13), so tier 4 (=13) is included since 13 is not > 13.
    expect(tiers.map((t) => ({ pomos: t.pomos, reached: t.reached }))).toEqual([
      { pomos: 5, reached: true },
      { pomos: 7, reached: true },
      { pomos: 9, reached: true },
      { pomos: 11, reached: false },
      { pomos: 13, reached: false },
    ]);
  });
});
