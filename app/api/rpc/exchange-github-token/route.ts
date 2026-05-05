/**
 * Exchange a GitHub OAuth access token for a tokmato Bearer JWT.
 *
 * Called by the RN client after Expo AuthSession completes a PKCE flow:
 *   1. RN POSTs `{ accessToken }` here.
 *   2. We verify the token by hitting GitHub's `/user` endpoint — if
 *      GitHub returns a numeric `id`, the token is valid and we know
 *      the account.
 *   3. We mint a JWT with `sub = "github:${id}"` (matching auth.ts:33-34)
 *      using the same AUTH_SECRET, salted with RPC_BEARER_SALT so it
 *      can never be confused with a next-auth session cookie.
 *   4. RN stores the JWT in `expo-secure-store` and sends it as
 *      `Authorization: Bearer <jwt>` on every subsequent /api/rpc call.
 *
 * Trust model: GitHub's OAuth token is the source of truth — we never
 * trust the client's claim of identity, only the response from GitHub.
 */

import { NextResponse } from "next/server";
import { encode } from "@auth/core/jwt";
import { z } from "zod";
import { RPC_BEARER_SALT } from "@/lib/rpc-auth";

const bodySchema = z.object({
  accessToken: z.string().min(10).max(500),
});

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "INVALID_PAYLOAD" }, { status: 400 });
  }

  let ghUser: { id: number } | null = null;
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${parsed.data.accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "tokmato-rpc",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }
    const json = (await res.json()) as { id?: number };
    if (typeof json.id !== "number") {
      return NextResponse.json(
        { ok: false, code: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }
    ghUser = { id: json.id };
  } catch {
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }

  const sub = `github:${ghUser.id}`;
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const jwt = await encode({
    token: { sub },
    secret,
    salt: RPC_BEARER_SALT,
    maxAge: TOKEN_TTL_SECONDS,
  });

  return NextResponse.json({ ok: true, jwt, sub, expiresAt });
}
