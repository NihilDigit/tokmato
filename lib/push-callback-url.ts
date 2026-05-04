// Shared resolver for the QStash callback URL.
//
// Both the publish-side (`startPushChain`) and the receive-side
// (`/api/push/fire` signature verifier) must agree on the exact URL,
// because the verifier checks `body + url` against QStash's signature.
// Any drift between the two and verification fails with 401.
//
// Why not just `${VERCEL_URL}/api/push/fire`: on Vercel, `VERCEL_URL`
// is the deployment-specific `*.vercel.app` host, which is gated by
// Deployment Protection (Vercel SSO). QStash gets a 401 from Vercel
// auth before our route handler ever runs. Mirror `auth.ts` and
// prefer the canonical custom domain on Vercel.

const CANONICAL_ORIGIN = "https://tokmato.nihildigit.dev";

export function pushCallbackUrl(): string {
  const explicit = process.env.QSTASH_CALLBACK_URL;
  if (explicit) return `${explicit.replace(/\/$/, "")}/api/push/fire`;
  const origin =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL ? CANONICAL_ORIGIN : undefined) ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
    CANONICAL_ORIGIN;
  return `${origin.replace(/\/$/, "")}/api/push/fire`;
}
