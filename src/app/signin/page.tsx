import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignInButtons } from "@/components/sign-in-button";
import {
  authOptions,
  canUsePractice,
  isAuthConfigured,
  isGitHubAuthConfigured,
  isGoogleAuthConfigured,
  isPreviewAuthBypassConfigured,
  isPreviewAuthBypassCookieValue,
  ownerGithubUsername,
  previewAuthCookieName,
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

async function SignInContent({ searchParams }: Props) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const previewAuthBypassActive = isPreviewAuthBypassCookieValue(
    cookieStore.get(previewAuthCookieName)?.value,
  );
  const needsSetup = params.setup === "1" || !isAuthConfigured();
  const authErrorMessage = getAuthErrorMessage(params.error);

  if (previewAuthBypassActive) {
    redirect("/");
  }

  if (!needsSetup) {
    const session = await getServerSession(authOptions);

    if (session && canUsePractice(session)) {
      redirect("/");
    }

    if (session) {
      redirect("/denied");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Scene Builder</h1>
        <p>
          @{ownerGithubUsername} はGitHubログインでownerとして利用できます。
          Googleログインユーザーはguestとしてカード練習とAI添削を利用できます。
        </p>
        {authErrorMessage ? <p className="error-note">{authErrorMessage}</p> : null}
        {needsSetup ? (
          <>
            <p>
              VercelにGitHub/Google OAuth用の環境変数を設定するとログインできます。
            </p>
            <ul className="setup-list">
              <li>AUTH_GITHUB_ID</li>
              <li>AUTH_GITHUB_SECRET</li>
              <li>AUTH_GOOGLE_ID</li>
              <li>AUTH_GOOGLE_SECRET</li>
              <li>AUTH_SECRET</li>
              <li>OWNER_GITHUB_USERNAME=kohei321dev</li>
            </ul>
            {isPreviewAuthBypassConfigured() ? (
              <p className="done-note">
                Preview認証バイパスが設定されています。保護されたPreviewで
                `/api/preview-auth?token=...` にアクセスするとowner確認できます。
              </p>
            ) : null}
          </>
        ) : (
          <SignInButtons
            allowGitHub={isGitHubAuthConfigured()}
            allowGoogle={isGoogleAuthConfigured()}
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
