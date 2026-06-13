import type { NextAuthOptions, Session } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const ownerGithubUsername =
  process.env.GITHUB_OWNER?.trim() || "kohei321dev";

const githubClientId = process.env.GITHUB_CLIENT_ID || "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || "";

export type UserRole = "owner";

const providers: NextAuthOptions["providers"] = [];

if (githubClientId && githubClientSecret) {
  providers.push(
    GitHubProvider({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  secret: process.env.AUTH_SECRET,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider) {
        token.authProvider = account.provider;
      }

      if (profile && account?.provider === "github") {
        const githubProfile = profile as { id?: number | string; login?: string };
        token.githubId = githubProfile.id?.toString();
        token.githubLogin = githubProfile.login;
      }

      if (token.githubLogin === ownerGithubUsername) {
        token.role = "owner";
      } else {
        token.role = undefined;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubId = token.githubId;
        session.user.githubLogin = token.githubLogin;
        session.user.authProvider = token.authProvider;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

export function isOwnerSession(session: Session | null): boolean {
  return session?.user?.role === "owner";
}

export function canUsePractice(session: Session | null): boolean {
  return isOwnerSession(session);
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_SECRET && isGitHubAuthConfigured());
}

export function isGitHubAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
}
