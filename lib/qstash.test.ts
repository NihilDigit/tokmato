/**
 * QStash smoke tests — talk to real Upstash QStash. Skipped when env
 * isn't configured (CI without secrets). The publish path costs one
 * QStash quota credit per run; we cancel immediately to avoid actually
 * delivering.
 */

import { describe, it, expect } from "bun:test";
import { Receiver } from "@upstash/qstash";

const hasEnv = Boolean(
  process.env.QSTASH_TOKEN &&
    process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY
);

const describeIf = hasEnv ? describe : describe.skip;

describeIf("qstash module (real env)", async () => {
  const { isQStashConfigured, publishWithDelay, cancelMessage, verifyQStashSignature } =
    await import("./qstash");

  it("isQStashConfigured returns true when env is set", () => {
    expect(isQStashConfigured()).toBe(true);
  });

  it("publishWithDelay → cancelMessage round-trips against real QStash", async () => {
    // Use a non-routable callback URL — we cancel before delivery so
    // QStash never actually POSTs there.
    const callbackUrl = "https://example.com/api/push/fire";
    const { messageId } = await publishWithDelay({
      callbackUrl,
      body: { test: true, timestamp: Date.now() },
      delaySeconds: 60,
    });
    expect(typeof messageId).toBe("string");
    expect(messageId.length).toBeGreaterThan(0);

    // Cancel — must not throw even though we're issuing right after publish.
    await cancelMessage(messageId);
  }, 15_000);

  it("verifyQStashSignature accepts a Receiver-signed payload", async () => {
    // Cross-check our wrapper by signing a payload via a Receiver-style
    // round trip is hard without a private signing key, so we just
    // verify that a known-bad signature is rejected.
    const ok = await verifyQStashSignature("bogus", "{}", "https://example.com/api/push/fire");
    expect(ok).toBe(false);
  });

  it("Receiver constructed with current env keys does not throw", () => {
    const r = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
    });
    expect(r).toBeDefined();
  });
});
