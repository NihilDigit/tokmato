// NextAuth v5 (Auth.js) — GitHub OAuth
// Run `bun add next-auth@beta` already done.
// Env: AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET (set in .env.local)

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Plain provider config — Auth.js derives `redirect_uri` from the
    // incoming request's host, which on production is always
    // tokmato.nihildigit.dev and matches what the GitHub OAuth App
    // has registered. The earlier `redirectProxyUrl` shim was added
    // for hypothetical preview-deploy access, but in practice the
    // *.vercel.app preview URLs are gated behind Vercel SSO and never
    // serve OAuth traffic; the proxy round-trip just added an extra
    // state-cookie hop that the Capacitor WebView fumbled, breaking
    // sign-in in the APK with InvalidCheck on every callback.
    GitHub,
  ],
  trustHost: true,
  // For MVP: single user, JWT session. Add Vercel KV adapter later if multi-device.
  session: { strategy: "jwt" },
  pages: {
    // Use shadcn-styled custom sign-in page later. For now, default.
  },
  callbacks: {
    async jwt({ token, account }) {
      // Bind token.sub to the OAuth provider's stable account id on first
      // sign-in. Without this, JWT strategy + no DB adapter mints a fresh
      // UUID per device, so each device ends up in its own KV namespace
      // and cross-device sync silently splits.
      if (account?.providerAccountId) {
        token.sub = `${account.provider}:${account.providerAccountId}`;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
      }
      return session;
    },
  },
});
