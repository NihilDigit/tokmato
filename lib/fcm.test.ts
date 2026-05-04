/**
 * fcm.ts smoke tests — verify Firebase Admin SDK initializes from env
 * and exercises the DISABLED branch when no service account is set.
 *
 * No actual delivery happens here — the bogus token would 410 anyway,
 * which is the documented EXPIRED branch.
 */

import { describe, expect, it } from "bun:test";

const hasEnv = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
);

describe("fcm wrapper", () => {
  it("returns DISABLED when env is missing", async () => {
    // Stash and clear env so the module sees no credentials.
    const a = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;
    const b = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    // Import a fresh module instance so the cached app is null.
    const mod = await import(`./fcm.ts?missing-${Date.now()}`);
    const result = await mod.sendFcmPush("bogus-token", { title: "t", body: "b" });
    expect(result.ok).toBe(false);
    expect((result as { reason?: string }).reason).toBe("DISABLED");

    // Restore so other tests in the same process see env again.
    if (a) process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64 = a;
    if (b) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = b;
  });

  if (hasEnv) {
    it("initializes successfully with a valid service account", async () => {
      const mod = await import(`./fcm.ts?env-${Date.now()}`);
      expect(mod.isFcmConfigured()).toBe(true);
    });

    it("sends to a deliberately-bogus token and reports EXPIRED or ERROR", async () => {
      const mod = await import(`./fcm.ts?env-${Date.now()}`);
      // 152-char string of arbitrary base64-ish chars — well-formed
      // shape, no actual device behind it. FCM should reject as
      // not-registered or invalid-argument.
      const token =
        "fbogus" +
        Array.from({ length: 146 }, () => "abcdefghijklmnopqrstuvwxyz0123456789-_".charAt(Math.floor(Math.random() * 38))).join("");
      const result = await mod.sendFcmPush(token, { title: "smoke", body: "test" });
      expect(result.ok).toBe(false);
      // Either EXPIRED or ERROR is fine — both indicate the SDK is
      // wired up and round-tripped against Google's servers.
      expect(["EXPIRED", "ERROR"]).toContain(
        (result as { reason: string }).reason
      );
    }, 15_000);
  }
});
