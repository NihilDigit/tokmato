/**
 * Unified user-id resolution for both cookie-session web traffic AND
 * Bearer-token RN traffic.
 *
 * Resolution order:
 *   1. `auth()` cookie session — set by next-auth on web sign-in.
 *   2. `Authorization: Bearer <jwt>` — minted by `/api/rpc/exchange-github-token`
 *      and stored in `expo-secure-store` on the RN client.
 *
 * Both paths land on the same `${provider}:${providerAccountId}` shape
 * that `auth.ts:33-34` writes into `token.sub`, so KV namespaces
 * (`tokmato:user:{id}:*`) round-trip identically across transports.
 */

import { auth } from "@/auth";
import { headers } from "next/headers";
import { decode } from "@auth/core/jwt";

export const RPC_BEARER_SALT = "tokmato.rpc.bearer";

class RpcAuthError extends Error {
  readonly code: "UNAUTHENTICATED";
  constructor() {
    super("UNAUTHENTICATED");
    this.code = "UNAUTHENTICATED";
    this.name = "RpcAuthError";
  }
}

export { RpcAuthError };

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set; cannot verify Bearer JWTs.");
  }
  return secret;
}

async function tryBearer(): Promise<string | null> {
  const headerList = await headers();
  const auth = headerList.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  try {
    const payload = await decode({
      token,
      secret: getSecret(),
      salt: RPC_BEARER_SALT,
    });
    if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Returns the user id, throwing `RpcAuthError` if neither transport
 * authenticates. Safe to call from server actions OR route handlers —
 * `auth()` and `headers()` both work in either context.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const cookieId = (session?.user as { id?: string } | undefined)?.id;
  if (cookieId) return cookieId;
  const bearerId = await tryBearer();
  if (bearerId) return bearerId;
  throw new RpcAuthError();
}

/** Variant that returns null instead of throwing — for endpoints that
 *  want to short-circuit with a custom error code. */
export async function tryUserId(): Promise<string | null> {
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
