/**
 * Resolve the current user id for server actions and route handlers.
 *
 * Web is the only authenticated transport — `auth()` reads the
 * cookie session set by next-auth. The earlier Bearer JWT path
 * existed solely for the retired Expo / RN client; it has no callers
 * since v4.x replaced that client with the native push relay.
 */

import { auth } from "@/auth";

class RpcAuthError extends Error {
  readonly code: "UNAUTHENTICATED";
  constructor() {
    super("UNAUTHENTICATED");
    this.code = "UNAUTHENTICATED";
    this.name = "RpcAuthError";
  }
}

export { RpcAuthError };

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new RpcAuthError();
  return id;
}

export async function tryUserId(): Promise<string | null> {
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
