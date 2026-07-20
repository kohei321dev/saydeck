import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppFrame } from "@/components/app-frame";
import { ExpressionExportPanel } from "@/components/expression-export-panel";
import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import { authOptions, isDevAuthBypassEnabled, isOwnerSession, ownerGithubUsername } from "@/lib/auth";
import { listExpressionEntries } from "@/lib/expression-store";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  let userLabel = ownerGithubUsername;
  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/signin");
    if (!isOwnerSession(session)) redirect("/denied");
    userLabel = session.user.githubLogin ?? ownerGithubUsername;
  }

  const ownerLogin = await getExpressionOwnerLogin();
  const entries = ownerLogin ? await listExpressionEntries(ownerLogin).catch(() => []) : [];

  return (
    <AppFrame activePath="export" roleLabel="owner" userLabel={userLabel}>
      <main className="library-page">
        <section className="library-intro">
          <p className="eyebrow">ANKI EXPORT</p>
          <h1>学習カードをまとめて出力</h1>
          <p>カード、タグ、登録期間を指定して、WAV音声・deck・タグを含むAnki用APKGを作成します。</p>
        </section>
        <ExpressionExportPanel entries={entries} />
      </main>
    </AppFrame>
  );
}
