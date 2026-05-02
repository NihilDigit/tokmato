/**
 * web-push smoke tests — verify VAPID config loads + module behaves
 * correctly when subscriptions are bogus or absent. Real delivery
 * requires a real PushSubscription which we can't fabricate from
 * a Node test, so we exercise the error branches that protect KV
 * cleanup logic in the QStash callback.
 */

import { describe, it, expect } from "bun:test";

const hasVapid = Boolean(
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY &&
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
    process.env.WEB_PUSH_VAPID_SUBJECT
);

const describeIf = hasVapid ? describe : describe.skip;

describeIf("web-push module (real VAPID)", async () => {
  const { sendWebPush } = await import("./web-push");

  it("returns ok=false / EXPIRED for an obviously-invalid endpoint", async () => {
    const subscription = {
      endpoint: "https://updates.push.services.mozilla.com/wpush/v1/gAAAAA-this-is-not-real",
      keys: {
        // Valid base64url-shaped strings so web-push doesn't reject at
        // VAPID-signing time. The push provider will reject the request.
        p256dh: "BNNL5ZaTfK8wXyG7R9q9wWp0vUA7YBgVqAvHwVLG0wF6LH9KQ8yX0n3X8Q9zX0n3X8Q9zX0n3X8Q9zX0n3X8Q9zXg",
        auth: "tBHItJI5svbpez7KI4CCXg",
      },
    };
    const result = await sendWebPush(subscription, {
      title: "smoke",
      body: "test",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either EXPIRED (404/410) or ERROR (other 4xx) is acceptable —
      // both prove web-push reached the provider with a signed VAPID
      // request and got a typed rejection back.
      expect(["EXPIRED", "ERROR"]).toContain(result.reason);
    }
  }, 15_000);
});

describe("web-push module (no env)", () => {
  it("returns ok=false / DISABLED when VAPID env is missing", async () => {
    const original = {
      pub: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
      priv: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
      sub: process.env.WEB_PUSH_VAPID_SUBJECT,
    };
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    delete process.env.WEB_PUSH_VAPID_SUBJECT;

    // Force a fresh module evaluation so the new env is read.
    const fresh = await import(`./web-push?cachebust=${Date.now()}`);
    const result = await fresh.sendWebPush(
      {
        endpoint: "https://example.invalid",
        keys: { p256dh: "x", auth: "x" },
      },
      { title: "x", body: "x" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("DISABLED");

    // Restore so other tests don't see the missing env.
    if (original.pub) process.env.WEB_PUSH_VAPID_PUBLIC_KEY = original.pub;
    if (original.priv) process.env.WEB_PUSH_VAPID_PRIVATE_KEY = original.priv;
    if (original.sub) process.env.WEB_PUSH_VAPID_SUBJECT = original.sub;
  });
});
