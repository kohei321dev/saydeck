import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      githubLogin?: string;
      githubId?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubLogin?: string;
    githubId?: string;
  }
}

