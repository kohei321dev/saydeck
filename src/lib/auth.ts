import type { NextAuthOptions, Session } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const ownerGithubUsername =
  process.env.OWNER_GITHUB_USERNAME?.trim() || "uechikohei";

const githubClientId =
  process.env.AUTH_GITHUB_ID || process.env.GITHUB_ID || "missing-client-id";
const githubClientSecret =
  process.env.AUTH_GITHUB_SECRET ||
  process.env.GITHUB_SECRET ||
  "missing-client-secret";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const githubProfile = profile as { id?: number | string; login?: string };
        token.githubId = githubProfile.id?.toString();
        token.githubLogin = githubProfile.login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubId = token.githubId;
        session.user.githubLogin = token.githubLogin;
      }
      return session;
    },
  },
};

export function isOwnerSession(session: Session | null): boolean {
  return session?.user?.githubLogin === ownerGithubUsername;
}

export function isAuthConfigured(): boolean {
  return Boolean(
    (process.env.AUTH_GITHUB_ID || process.env.GITHUB_ID) &&
      (process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_SECRET) &&
      (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
  );
}

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
}
