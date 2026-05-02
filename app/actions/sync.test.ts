import { beforeEach, describe, expect, it, mock } from "bun:test";

let session: { user?: { id?: string } } | null = null;
const redisSet = mock(async () => undefined);
const redisGet = mock(async () => null as unknown);
const requireRedis = mock(() => ({
  set: redisSet,
  get: redisGet,
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
  requireRedis.mockClear();
});

describe("saveToCloud", () => {
  it("throws UNAUTHENTICATED before touching Redis when there is no user id", async () => {
    await expect(saveToCloud({ ftoken: 1 })).rejects.toThrow("UNAUTHENTICATED");
    expect(requireRedis).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("stores the snapshot under the authenticated user's state key", async () => {
    session = { user: { id: "u_abc" } };
    const before = Date.now();

    const result = await saveToCloud({ ftoken: 2 });

    expect(result.ok).toBe(true);
    expect(result.savedAt).toBeGreaterThanOrEqual(before);
    expect(redisSet).toHaveBeenCalledWith("tokmato:user:u_abc:state", {
      snapshot: { ftoken: 2 },
      savedAt: result.savedAt,
    });
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
    const payload = { snapshot: { htoken: 3 }, savedAt: 123 };
    redisGet.mockResolvedValueOnce(payload);

    await expect(loadFromCloud()).resolves.toEqual(payload);
    expect(redisGet).toHaveBeenCalledWith("tokmato:user:u_abc:state");
  });
});
