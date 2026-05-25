import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { isAllowedGitHubLogin, readGitHubLogin } from "@/lib/auth-policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
    error: "/denied",
  },
  callbacks: {
    signIn({ profile }) {
      return isAllowedGitHubLogin(readGitHubLogin(profile)) ? true : "/denied";
    },
    jwt({ token, profile }) {
      const login = readGitHubLogin(profile);

      if (login) {
        token.githubLogin = login;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.githubLogin =
          typeof token.githubLogin === "string" ? token.githubLogin : undefined;
      }

      return session;
    },
  },
});
