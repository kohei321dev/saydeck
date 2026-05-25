import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Access denied</h1>
        <p>GitHub login is limited to the configured owner account.</p>
        <Link href="/">Back</Link>
      </section>
    </main>
  );
}
