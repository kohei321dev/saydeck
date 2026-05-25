import Link from "next/link";

import { getOwnerGitHubUsername } from "@/lib/auth-policy";

export default function DeniedPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Access denied</h1>
        <p>This app is limited to @{getOwnerGitHubUsername()}.</p>
        <Link href="/signin">Back to sign in</Link>
      </section>
    </main>
  );
}
