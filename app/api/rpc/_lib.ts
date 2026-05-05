/**
 * Shared helpers for the RN-facing REST endpoints under /api/rpc/*.
 *
 * Each route is a thin wrapper around an existing server action; this
 * helper canonicalizes error → HTTP-status mapping so the RN client gets
 * stable codes regardless of which subsystem raised the error.
 */

import { NextResponse } from "next/server";

type KnownCode =
  | "UNAUTHENTICATED"
  | "INVALID_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "PUSH_DISABLED"
  | "NO_SUBSCRIPTION"
  | "INTERNAL";

const STATUS: Record<KnownCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_PAYLOAD: 400,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  PUSH_DISABLED: 503,
  NO_SUBSCRIPTION: 404,
  INTERNAL: 500,
};

export function rpcOk<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, ...data });
}

export function rpcError(code: KnownCode, status?: number): NextResponse {
  return NextResponse.json({ ok: false, code }, { status: status ?? STATUS[code] });
}

/** Wrap a route handler so any thrown action error (with `.code`) maps
 *  to a stable JSON response. Unknown errors become 500/INTERNAL and are
 *  logged in non-production. */
export async function withRpc<T>(
  handler: () => Promise<T>,
  toResponse: (data: T) => NextResponse = (d) => NextResponse.json({ ok: true, ...(d ?? {}) })
): Promise<NextResponse> {
  try {
    const data = await handler();
    return toResponse(data);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code && code in STATUS) {
      return rpcError(code as KnownCode);
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("[rpc] unexpected error", err);
    }
    return rpcError("INTERNAL");
  }
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw Object.assign(new Error("INVALID_PAYLOAD"), { code: "INVALID_PAYLOAD" });
  }
}
