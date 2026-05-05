/**
 * GitHub OAuth via Expo AuthSession PKCE → tokmato Bearer JWT.
 *
 * Flow:
 *   1. expo-auth-session opens GitHub's OAuth consent in the system
 *      browser tab (ASWebAuthenticationSession on iOS, Custom Tabs
 *      on Android) with PKCE.
 *   2. User authorizes; GitHub redirects to `tokmato://auth/callback`
 *      with `code` + `code_verifier`.
 *   3. We exchange the code with GitHub directly (no server middleman)
 *      to get an access_token.
 *   4. POST that access_token to `/api/rpc/exchange-github-token`,
 *      which verifies it against the GitHub /user endpoint and mints
 *      our own bearer JWT (sub matches `auth.ts:33-34` shape).
 *   5. Stash the JWT in expo-secure-store. All subsequent RPC calls
 *      bear it via `rpc-client.ts`.
 *
 * The GitHub OAuth App that backs this flow needs `tokmato://auth/callback`
 * registered as an authorized callback URL alongside the existing web
 * callback. The client_id is the same as the web one — GitHub allows
 * multiple callback URLs per app.
 */

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { rpc, setStoredJwt, clearStoredJwt } from "./rpc-client";

WebBrowser.maybeCompleteAuthSession();

const GITHUB_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://github.com/login/oauth/authorize",
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  revocationEndpoint:
    "https://github.com/settings/connections/applications/{client_id}",
};

let cachedClientId: string | null = null;

/**
 * Resolves the GitHub OAuth client_id from the server. Single source
 * of truth is Vercel's `AUTH_GITHUB_ID` env (same value web's
 * next-auth uses). Cached in-memory after first call so the OAuth
 * dance only pays one extra round-trip on cold start.
 */
async function clientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const out = await rpc.getGithubClientId();
  if (!out.clientId) {
    throw new Error(
      "GitHub OAuth client id missing on server — check Vercel AUTH_GITHUB_ID env.",
    );
  }
  cachedClientId = out.clientId;
  return cachedClientId;
}

export type SignInResult =
  | { ok: true; sub: string; expiresAt: number }
  | { ok: false; reason: "cancelled" | "denied" | "exchange_failed" };

/**
 * Run the OAuth dance. On success the JWT is in secure-store and
 * subsequent rpc.* calls authenticate automatically.
 */
export async function signInWithGithub(): Promise<SignInResult> {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "tokmato",
    path: "auth/callback",
  });

  let id: string;
  try {
    id = await clientId();
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }

  const request = new AuthSession.AuthRequest({
    clientId: id,
    scopes: ["read:user"],
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  });

  const result = await request.promptAsync(GITHUB_DISCOVERY);

  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, reason: "cancelled" };
  }
  if (result.type !== "success" || !result.params.code) {
    return { ok: false, reason: "denied" };
  }

  // GitHub's token endpoint expects form-encoded; AuthSession handles
  // the encoding for us.
  let tokenResp: AuthSession.TokenResponse;
  try {
    tokenResp = await AuthSession.exchangeCodeAsync(
      {
        clientId: id,
        code: result.params.code,
        redirectUri,
        extraParams: request.codeVerifier
          ? { code_verifier: request.codeVerifier }
          : undefined,
      },
      GITHUB_DISCOVERY,
    );
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }

  if (!tokenResp.accessToken) {
    return { ok: false, reason: "exchange_failed" };
  }

  try {
    const out = await rpc.exchangeGithubToken(tokenResp.accessToken);
    await setStoredJwt(out.jwt);
    return { ok: true, sub: out.sub, expiresAt: out.expiresAt };
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }
}

export async function signOut(): Promise<void> {
  await clearStoredJwt();
}
