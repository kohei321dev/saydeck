import { getServerSession } from "next-auth";

import { SignOutButton } from "@/components/sign-in-button";
import { authOptions, ownerGithubUsername } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DeniedPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Access denied</h1>
        <p>
          このMVPは @{ownerGithubUsername} だけが閲覧できます。現在のログイン:
          @{session?.user?.githubLogin ?? "unknown"}
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}

