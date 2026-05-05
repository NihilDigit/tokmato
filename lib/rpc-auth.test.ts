/**
 * Unit tests for the unified cookie-or-Bearer auth helper. Mocks both
 * `@/auth` (cookie session) and `next/headers` (Bearer header) to cover
 * the two transports without spinning up a real request.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let mockSession: { user?: { id?: string } } | null = null;
let mockHeaders: Map<string, string> = new Map();

mock.module("@/auth", () => ({
  auth: async () => mockSession,
}));

mock.module("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => mockHeaders.get(name.toLowerCase()) ?? null,
  }),
}));

const TEST_SECRET = "test-secret-rpc-auth-3939393939393939";
process.env.AUTH_SECRET = TEST_SECRET;

describe("rpc-auth", () => {
  beforeEach(() => {
    mockSession = null;
    mockHeaders = new Map();
  });

  afterEach(() => {
    mockSession = null;
    mockHeaders = new Map();
  });

  it("resolves cookie session when present", async () => {
    const { requireUserId } = await import("./rpc-auth");
    mockSession = { user: { id: "github:42" } };
    expect(await requireUserId()).toBe("github:42");
  });

  it("falls back to Bearer when no cookie session", async () => {
    const { encode } = await import("@auth/core/jwt");
    const { requireUserId, RPC_BEARER_SALT } = await import("./rpc-auth");
    const jwt = await encode({
      token: { sub: "github:99" },
      secret: TEST_SECRET,
      salt: RPC_BEARER_SALT,
      maxAge: 60,
    });
    mockHeaders.set("authorization", `Bearer ${jwt}`);
    expect(await requireUserId()).toBe("github:99");
  });

  it("rejects Bearer signed with wrong secret", async () => {
    const { encode } = await import("@auth/core/jwt");
    const { requireUserId, RPC_BEARER_SALT, RpcAuthError } = await import(
      "./rpc-auth"
    );
    const jwt = await encode({
      token: { sub: "github:99" },
      secret: "different-secret-for-this-tampering-test-aaaaaaaa",
      salt: RPC_BEARER_SALT,
      maxAge: 60,
    });
    mockHeaders.set("authorization", `Bearer ${jwt}`);
    await expect(requireUserId()).rejects.toBeInstanceOf(RpcAuthError);
  });

  it("rejects Bearer with wrong salt (cookie-session JWT must not work)", async () => {
    const { encode } = await import("@auth/core/jwt");
    const { requireUserId, RpcAuthError } = await import("./rpc-auth");
    const jwt = await encode({
      token: { sub: "github:99" },
      secret: TEST_SECRET,
      salt: "authjs.session-token", // next-auth's cookie salt — must not be accepted
      maxAge: 60,
    });
    mockHeaders.set("authorization", `Bearer ${jwt}`);
    await expect(requireUserId()).rejects.toBeInstanceOf(RpcAuthError);
  });

  it("throws when neither transport authenticates", async () => {
    const { requireUserId, RpcAuthError } = await import("./rpc-auth");
    await expect(requireUserId()).rejects.toBeInstanceOf(RpcAuthError);
  });

  it("cookie wins over Bearer when both present", async () => {
    const { encode } = await import("@auth/core/jwt");
    const { requireUserId, RPC_BEARER_SALT } = await import("./rpc-auth");
    mockSession = { user: { id: "github:cookie-wins" } };
    const jwt = await encode({
      token: { sub: "github:bearer-loses" },
      secret: TEST_SECRET,
      salt: RPC_BEARER_SALT,
      maxAge: 60,
    });
    mockHeaders.set("authorization", `Bearer ${jwt}`);
    expect(await requireUserId()).toBe("github:cookie-wins");
  });
});
