/**
 * Client for /api/rpc/* on tokmato.nihildigit.dev.
 *
 * - Always sends `Authorization: Bearer <jwt>` from secure-store if
 *   present. The backend (lib/rpc-auth.ts) accepts cookie OR bearer;
 *   we only ever produce bearer here.
 * - On 401, clears the local JWT so the auth flow knows to re-prompt.
 * - Surface stable error codes — raw HTTP errors are masked to a
 *   discriminated union the UI can switch on.
 */

import * as SecureStore from "expo-secure-store";
import { apiBase } from "./api-base";

const JWT_KEY = "tokmato.rpc.jwt";

export type RpcErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_PAYLOAD"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "PUSH_DISABLED"
  | "NO_SUBSCRIPTION"
  | "INTERNAL"
  | "NETWORK";

export class RpcError extends Error {
  readonly code: RpcErrorCode;
  readonly status: number;
  constructor(code: RpcErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.name = "RpcError";
  }
}

export async function getStoredJwt(): Promise<string | null> {
  return (await SecureStore.getItemAsync(JWT_KEY)) ?? null;
}

export async function setStoredJwt(jwt: string): Promise<void> {
  await SecureStore.setItemAsync(JWT_KEY, jwt);
}

export async function clearStoredJwt(): Promise<void> {
  await SecureStore.deleteItemAsync(JWT_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit & { body?: unknown },
): Promise<T> {
  const jwt = await getStoredJwt();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new RpcError(
      "NETWORK",
      0,
      err instanceof Error ? err.message : String(err),
    );
  }

  if (res.status === 401) {
    await clearStoredJwt();
    throw new RpcError("UNAUTHENTICATED", 401);
  }
  if (!res.ok) {
    let code: RpcErrorCode = "INTERNAL";
    try {
      const json = (await res.json()) as { code?: string };
      if (json.code && (json.code as RpcErrorCode)) {
        code = json.code as RpcErrorCode;
      }
    } catch {}
    throw new RpcError(code, res.status);
  }
  return (await res.json()) as T;
}

export const rpc = {
  saveCloud: (snapshot: unknown) =>
    request<{ ok: true; savedAt: number }>("/api/rpc/save-cloud", {
      method: "POST",
      body: { snapshot },
    }),

  loadCloud: () =>
    request<{
      ok: true;
      data: { snapshot: unknown; savedAt: number } | null;
    }>("/api/rpc/load-cloud", { method: "GET" }),

  savePushSubscription: (sub: unknown) =>
    request<{ ok: true }>("/api/rpc/save-push-subscription", {
      method: "POST",
      body: sub,
    }),

  removePushSubscription: (endpoint?: string) =>
    request<{ ok: true }>("/api/rpc/remove-push-subscription", {
      method: "POST",
      body: { endpoint },
    }),

  saveFcmToken: (token: string) =>
    request<{ ok: true }>("/api/rpc/save-fcm-token", {
      method: "POST",
      body: { token },
    }),

  removeFcmToken: (token?: string) =>
    request<{ ok: true }>("/api/rpc/remove-fcm-token", {
      method: "POST",
      body: { token },
    }),

  startPushChain: (args: {
    sessionId: string;
    boundaryAt: number;
    kind: "running-end" | "buffer-end" | "play-end";
    count: number;
  }) =>
    request<{ ok: true; scheduled: boolean }>("/api/rpc/start-push-chain", {
      method: "POST",
      body: args,
    }),

  cancelPushChain: () =>
    request<{ ok: true }>("/api/rpc/cancel-push-chain", { method: "POST" }),

  setActiveSession: (marker: {
    task: string;
    tag: string;
    type: "input" | "output";
    startedAt: number;
    phaseStartedAt: number;
    mode: "running" | "buffer";
    count: number;
  }) =>
    request<{ ok: true }>("/api/rpc/set-active-session", {
      method: "POST",
      body: marker,
    }),

  clearActiveSession: () =>
    request<{ ok: true }>("/api/rpc/clear-active-session", { method: "POST" }),

  getActiveSession: () =>
    request<{ ok: true; data: unknown }>("/api/rpc/get-active-session", {
      method: "GET",
    }),

  exchangeGithubToken: (accessToken: string) =>
    request<{ ok: true; jwt: string; sub: string; expiresAt: number }>(
      "/api/rpc/exchange-github-token",
      { method: "POST", body: { accessToken } },
    ),

  /** No auth — see app/api/rpc/github-client-id/route.ts. The client_id
   *  is non-secret (visible in the OAuth redirect URL); fetching it
   *  removes the duplication with Vercel's AUTH_GITHUB_ID env. */
  getGithubClientId: () =>
    request<{ ok: true; clientId: string }>("/api/rpc/github-client-id", {
      method: "GET",
    }),
};
