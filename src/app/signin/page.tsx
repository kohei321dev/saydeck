import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignInButtons } from "@/components/sign-in-button";
import {
  authOptions,
  isAuthConfigured,
  isGitHubAuthConfigured,
  isOwnerSession,
  ownerGithubUsername,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    error?: string;
    setup?: string;
  }>;
};

function getAuthErrorMessage(error?: string): string | null {
  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    AccessDenied: "このアカウントでは利用できません。",
    Callback: "認証の戻り処理に失敗しました。OAuth Appのcallback URLを確認してください。",
    Configuration: "認証設定に問題があります。Vercelの環境変数を確認してください。",
    OAuthCallback: "認証のcallback処理に失敗しました。",
    OAuthSignin: "認証の開始に失敗しました。",
  };

  return messages[error] ?? `ログインに失敗しました: ${error}`;
}

async function getRequestOrigin(): Promise<string | null> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

  if (!host) {
    return null;
  }

  const protocol = headerStore.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

function getCanonicalAuthOrigin(): string | null {
  const configuredUrl = process.env.NEXTAUTH_URL?.trim();

  if (!configuredUrl) {
    return null;
  }

  try {
    return new URL(configuredUrl).origin;
  } catch {
    return null;
  }
}

async function SignInContent({ searchParams }: Props) {
  const params = await searchParams;
  const authOrigin = await getRequestOrigin();
  const canonicalAuthOrigin = getCanonicalAuthOrigin();

  if (canonicalAuthOrigin && authOrigin && canonicalAuthOrigin !== authOrigin) {
    redirect(`${canonicalAuthOrigin}/signin`);
  }

  const needsSetup = params.setup === "1" || !isAuthConfigured();
  const authErrorMessage = getAuthErrorMessage(params.error);
  const githubConfigured = isGitHubAuthConfigured();
  const callbackOrigin = canonicalAuthOrigin ?? authOrigin;
  const callbackUrl = callbackOrigin ? `${callbackOrigin}/` : "/";
  const missingProviderNames = [
    githubConfigured ? null : "GitHub",
  ].filter((name): name is string => Boolean(name));

  if (!needsSetup) {
    const session = await getServerSession(authOptions);

    if (session && isOwnerSession(session)) {
      redirect("/input");
    }

    if (session) {
      redirect("/denied");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>SayDeck</h1>
        <p>
          GitHub ownerアカウントで利用できます。
        </p>
        {authErrorMessage ? <p className="error-note">{authErrorMessage}</p> : null}
        {!needsSetup && missingProviderNames.length > 0 ? (
          <p className="error-note">
            ProductionのOAuth設定で {missingProviderNames.join(" / ")} が未有効です。
            Vercel Production envとOAuth callback URLを確認してください。
          </p>
        ) : null}
        <dl className="auth-status-list">
          <div>
            <dt>GitHub OAuth</dt>
            <dd>{githubConfigured ? "有効" : "未設定"}</dd>
          </div>
          <div>
            <dt>GitHub owner</dt>
            <dd>@{ownerGithubUsername}</dd>
          </div>
        </dl>
        {callbackOrigin ? (
          <div className="callback-list">
            <span>OAuth callback URL</span>
            <code>{callbackOrigin}/api/auth/callback/github</code>
          </div>
        ) : null}
        {needsSetup ? (
          <>
            <p>
              Vercel ProductionにGitHub OAuth用の環境変数を設定するとログインできます。
            </p>
            <ul className="setup-list">
              <li>GITHUB_CLIENT_ID</li>
              <li>GITHUB_CLIENT_SECRET</li>
              <li>AUTH_SECRET</li>
              <li>GITHUB_OWNER=kohei321dev</li>
            </ul>
          </>
        ) : (
          <SignInButtons
            allowGitHub={githubConfigured}
            callbackUrl={callbackUrl}
          />
        )}
      </section>
    </main>
  );
}

export default function SignInPage(props: Props) {
  return (
    <Suspense>
      <SignInContent {...props} />
    </Suspense>
  );
}
