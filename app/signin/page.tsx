import { LogIn } from "lucide-react";

import { signIn } from "@/auth";
import { getOwnerGitHubUsername, isAuthConfigured } from "@/lib/auth-policy";

type SignInPageProps = {
  searchParams: Promise<{
    setup?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const needsSetup = params.setup === "1" || !isAuthConfigured();

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Scene Builder</h1>
        <p>
          GitHub login is required. This deployment is limited to @
          {getOwnerGitHubUsername()}.
        </p>
        {needsSetup ? (
          <>
            <p>Set these environment variables in Vercel before signing in.</p>
            <ul className="setup-list">
              <li>AUTH_SECRET</li>
              <li>AUTH_GITHUB_ID</li>
              <li>AUTH_GITHUB_SECRET</li>
              <li>OWNER_GITHUB_USERNAME=uechikohei</li>
              <li>XAI_API_KEY</li>
              <li>XAI_MODEL=grok-4.3</li>
            </ul>
          </>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/" });
            }}
          >
            <button className="auth-button" type="submit">
              <LogIn aria-hidden="true" size={18} />
              GitHub login
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
