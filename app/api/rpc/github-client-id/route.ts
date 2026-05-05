/**
 * Public endpoint — returns the GitHub OAuth App's client_id.
 *
 * The client_id is intentionally non-secret (it appears in the OAuth
 * redirect URL the moment the user starts sign-in), but it's the
 * identifier the RN app needs before it can launch
 * `expo-auth-session` PKCE. Putting it in `mobile/app.json` would
 * have meant duplicating the value already living in Vercel env as
 * `AUTH_GITHUB_ID`; this endpoint keeps a single source of truth and
 * lets credential rotation happen with zero RN code change.
 *
 * No auth gate — by design. The data here is what `auth.ts:19`'s
 * `GitHub` provider also exposes implicitly to anyone who clicks
 * "sign in with GitHub" on the web.
 */

import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const id = process.env.AUTH_GITHUB_ID;
  if (!id) {
    return NextResponse.json(
      { ok: false, code: "INTERNAL" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, clientId: id });
}
