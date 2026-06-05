import type { NextAuthOptions, Session } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { createHash, timingSafeEqual } from "crypto";

export const ownerGithubUsername =
  process.env.OWNER_GITHUB_USERNAME?.trim() || "kohei321dev";

export const previewAuthCookieName = "scene_builder_preview_auth";
export const previewAuthCookieMaxAgeSeconds = 60 * 60 * 8;

const githubClientId =
  process.env.AUTH_GITHUB_ID || process.env.GITHUB_ID || "";
const githubClientSecret =
  process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_SECRET || "";
const googleClientId =
  process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const previewAuthBypassSecret = process.env.PREVIEW_AUTH_BYPASS_SECRET?.trim() || "";

export type UserRole = "owner" | "guest";

const providers: NextAuthOptions["providers"] = [];

if (githubClientId && githubClientSecret) {
  providers.push(
    GitHubProvider({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    }),
  );
}

if (googleClientId && googleClientSecret) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
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
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
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

      if (profile && account?.provider === "google") {
        const googleProfile = profile as { sub?: string; email?: string };
        token.googleId = googleProfile.sub;
        token.googleEmail = googleProfile.email;
      }

      if (token.githubLogin === ownerGithubUsername) {
        token.role = "owner";
      } else if (token.authProvider === "google") {
        token.role = "guest";
      } else {
        token.role = undefined;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.githubId = token.githubId;
        session.user.githubLogin = token.githubLogin;
        session.user.googleId = token.googleId;
        session.user.googleEmail = token.googleEmail;
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

export function isGuestSession(session: Session | null): boolean {
  return session?.user?.role === "guest";
}

export function canUsePractice(session: Session | null): boolean {
  return isOwnerSession(session) || isGuestSession(session);
}

export function isAuthConfigured(): boolean {
  return Boolean(
    (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) &&
      (isGitHubAuthConfigured() || isGoogleAuthConfigured()),
  );
}

export function isGitHubAuthConfigured(): boolean {
  return Boolean(
    (process.env.AUTH_GITHUB_ID || process.env.GITHUB_ID) &&
      (process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_SECRET),
  );
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    (process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID) &&
      (process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET),
  );
}

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
}

export function isVercelPreviewEnvironment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export function isPreviewAuthBypassConfigured(): boolean {
  return isVercelPreviewEnvironment() && Boolean(previewAuthBypassSecret);
}

export function getPreviewAuthBypassCookieValue(): string | null {
  if (!isPreviewAuthBypassConfigured()) {
    return null;
  }

  return createHash("sha256")
    .update(`scene-builder-preview-auth:${previewAuthBypassSecret}`)
    .digest("hex");
}

export function isPreviewAuthBypassTokenValid(token: string | null): boolean {
  return Boolean(
    token &&
      isPreviewAuthBypassConfigured() &&
      timingSafeEqualString(token, previewAuthBypassSecret),
  );
}

export function isPreviewAuthBypassCookieValue(value: string | null | undefined): boolean {
  const expected = getPreviewAuthBypassCookieValue();

  return Boolean(value && expected && timingSafeEqualString(value, expected));
}

export function isPreviewAuthBypassRequestEnabled(request: Request): boolean {
  return isPreviewAuthBypassCookieValue(
    readCookieValue(request.headers.get("cookie"), previewAuthCookieName),
  );
}

export function isAuthBypassRequestEnabled(request: Request): boolean {
  return isDevAuthBypassEnabled() || isPreviewAuthBypassRequestEnabled(request);
}

function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");

    if (rawName === name) {
      return safeDecodeURIComponent(rawValueParts.join("="));
    }
  }

  return null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
