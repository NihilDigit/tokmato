// NextAuth v5 (Auth.js) — GitHub OAuth
// Run `bun add next-auth@beta` already done.
// Env: AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET (set in .env.local)

import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const CANONICAL_AUTH_ORIGIN = "https://tokmato.nihildigit.dev";
const authOrigin =
  process.env.AUTH_URL ??
  process.env.NEXTAUTH_URL ??
  (process.env.VERCEL ? CANONICAL_AUTH_ORIGIN : undefined);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      // GitHub OAuth Apps require an exact callback URL match. On Vercel,
      // force OAuth through the canonical production domain so preview or
      // platform hosts do not generate an unregistered redirect_uri.
      redirectProxyUrl: authOrigin ? `${authOrigin}/api/auth` : undefined,
    }),
  ],
  trustHost: true,
  // For MVP: single user, JWT session. Add Vercel KV adapter later if multi-device.
  session: { strategy: "jwt" },
  pages: {
    // Use shadcn-styled custom sign-in page later. For now, default.
  },
  callbacks: {
    async session({ session, token }) {
      // Surface the user id (from `sub`) so server actions can namespace KV keys.
      if (token.sub && session.user) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
      }
      return session;
    },
  },
});
