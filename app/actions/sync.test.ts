import { beforeEach, describe, expect, it, mock } from "bun:test";

let session: { user?: { id?: string } } | null = null;
const redisSet = mock(async () => undefined);
const redisGet = mock(async () => null as unknown);
const redisIncr = mock(async () => 1 as number);
const redisExpire = mock(async () => 1 as number);
const requireRedis = mock(() => ({
  set: redisSet,
  get: redisGet,
  incr: redisIncr,
  expire: redisExpire,
}));

mock.module("@/auth", () => ({
  auth: async () => session,
}));

mock.module("@/lib/kv", () => ({
  requireRedis,
  kvKey: {
    userState: (userId: string) => `tokmato:user:${userId}:state`,
  },
}));

const { loadFromCloud, saveToCloud } = await import("./sync");

beforeEach(() => {
  session = null;
  redisSet.mockClear();
  redisGet.mockClear();
  redisIncr.mockClear();
  redisExpire.mockClear();
  redisIncr.mockImplementation(async () => 1);
  requireRedis.mockClear();
});

/** A minimal valid snapshot matching `persistedSnapshotSchema`. Tests
 *  that mutate one field clone this and override. */
function validSnapshot() {
  return {
    ftoken: 1,
    htoken: 0,
    timePool: 0,
    lastSettledDate: null,
    activeDay: "2026-05-03",
    session: null,
    playSession: null,
    todayMathPomos: 0,
    todayPomos: 0,
    todayFGained: 0,
    todayHGained: 0,
    todayPoolGained: 0,
    welcomeGrantedUserIds: [],
    pomodoroHistory: [],
    tokenHistory: [],
    wishlist: [],
    achievements: [],
    kanban: { inbox: [], Q1: [], Q2: [], Q3: [], Q4: [] },
    recentTasks: [],
    foodPresets: [],
  };
}

describe("saveToCloud", () => {
  it("throws UNAUTHENTICATED before touching Redis when there is no user id", async () => {
    await expect(saveToCloud(validSnapshot())).rejects.toThrow("UNAUTHENTICATED");
    expect(requireRedis).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
    expect(redisIncr).not.toHaveBeenCalled();
  });

  it("rejects malformed snapshots without writing to Redis", async () => {
    session = { user: { id: "u_abc" } };
    await expect(saveToCloud({ ftoken: 1 })).rejects.toThrow("INVALID_PAYLOAD");
    expect(redisSet).not.toHaveBeenCalled();
    expect(redisIncr).not.toHaveBeenCalled();
  });

  it("rejects unknown top-level keys (strict schema)", async () => {
    session = { user: { id: "u_abc" } };
    const bad = { ...validSnapshot(), evil: "payload" };
    await expect(saveToCloud(bad)).rejects.toThrow("INVALID_PAYLOAD");
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("rejects oversized payloads before parsing", async () => {
    session = { user: { id: "u_abc" } };
    const bloated = {
      ...validSnapshot(),
      // Single huge string blows past 256KB.
      recentTasks: [new Array(300_000).fill("x").join("")],
    };
    await expect(saveToCloud(bloated)).rejects.toThrow("PAYLOAD_TOO_LARGE");
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("stores the validated snapshot under the authenticated user's state key", async () => {
    session = { user: { id: "u_abc" } };
    const snap = validSnapshot();
    const before = Date.now();

    const result = await saveToCloud(snap);

    expect(result.ok).toBe(true);
    expect(result.savedAt).toBeGreaterThanOrEqual(before);
    expect(redisIncr).toHaveBeenCalledTimes(1);
    expect(redisSet).toHaveBeenCalledTimes(1);
    const [key, value] = redisSet.mock.calls[0];
    expect(key).toBe("tokmato:user:u_abc:state");
    expect(value).toMatchObject({ savedAt: result.savedAt });
    expect((value as { snapshot: unknown }).snapshot).toMatchObject({ ftoken: 1 });
  });

  it("rate-limits when the user exceeds the per-window cap", async () => {
    session = { user: { id: "u_abc" } };
    redisIncr.mockImplementation(async () => 99); // way over 30
    await expect(saveToCloud(validSnapshot())).rejects.toThrow("RATE_LIMITED");
    expect(redisSet).not.toHaveBeenCalled();
  });
});

describe("loadFromCloud", () => {
  it("throws UNAUTHENTICATED before touching Redis when there is no user id", async () => {
    await expect(loadFromCloud()).rejects.toThrow("UNAUTHENTICATED");
    expect(requireRedis).not.toHaveBeenCalled();
    expect(redisGet).not.toHaveBeenCalled();
  });

  it("returns the saved cloud payload for the authenticated user", async () => {
    session = { user: { id: "u_abc" } };
    const payload = { snapshot: validSnapshot(), savedAt: 123 };
    redisGet.mockResolvedValueOnce(payload);

    await expect(loadFromCloud()).resolves.toEqual(payload);
    expect(redisGet).toHaveBeenCalledWith("tokmato:user:u_abc:state");
  });
});
