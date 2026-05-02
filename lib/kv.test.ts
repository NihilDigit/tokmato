import { describe, expect, it } from "bun:test";

const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("[kv]")) return;
  originalWarn(...(args as Parameters<typeof console.warn>));
};

const { kvKey, redis, requireRedis } = await import("./kv");

const hasEnv = Boolean(
  (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
);

describe("kvKey", () => {
  it("uses the tokmato user-state namespace", () => {
    expect(kvKey.userState("u_abc")).toBe("tokmato:user:u_abc:state");
  });
});

describe("requireRedis", () => {
  it("matches the env-derived redis singleton state", () => {
    if (hasEnv) {
      expect(redis).not.toBeNull();
      expect(requireRedis()).toBe(redis);
    } else {
      expect(redis).toBeNull();
      expect(() => requireRedis()).toThrow(/KV.*Redis.*not configured/);
    }
  });
});
