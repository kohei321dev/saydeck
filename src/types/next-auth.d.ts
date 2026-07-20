import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      authProvider?: string;
      githubLogin?: string;
      githubId?: string;
      role?: "owner";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authProvider?: string;
    githubLogin?: string;
    githubId?: string;
    role?: "owner";
  }
}
