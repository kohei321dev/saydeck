import { Suspense } from "react";

import { SignInButton } from "@/components/sign-in-button";
import { ownerGithubUsername } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    setup?: string;
  }>;
};

async function SignInContent({ searchParams }: Props) {
  const params = await searchParams;
  const needsSetup = params.setup === "1";

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Scene Builder</h1>
        <p>
          GitHubログインで保護されています。現在は @{ownerGithubUsername}
          だけが閲覧できます。
        </p>
        {needsSetup ? (
          <>
            <p>
              VercelにGitHub OAuth用の環境変数を設定するとログインできます。
            </p>
            <ul className="setup-list">
              <li>AUTH_GITHUB_ID</li>
              <li>AUTH_GITHUB_SECRET</li>
              <li>AUTH_SECRET</li>
              <li>OWNER_GITHUB_USERNAME=uechikohei</li>
            </ul>
          </>
        ) : (
          <SignInButton />
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

