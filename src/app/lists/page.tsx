import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppFrame } from "@/components/app-frame";
import { ExpressionLibrary } from "@/components/expression-library";
import { authOptions, isDevAuthBypassEnabled, isOwnerSession, ownerGithubUsername } from "@/lib/auth";
import type { ExpressionEntryDetail } from "@/lib/expression-types";
import { ExpressionDatabaseUnavailableError, listExpressionEntries } from "@/lib/expression-store";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  let ownerLogin = ownerGithubUsername;
  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/signin");
    if (!isOwnerSession(session)) redirect("/denied");
    ownerLogin = session.user.githubLogin ?? ownerGithubUsername;
  }

  let entries: ExpressionEntryDetail[] = [];
  let loadError: string | null = null;
  try {
    entries = await listExpressionEntries(ownerLogin);
  } catch (error) {
    if (!(error instanceof ExpressionDatabaseUnavailableError)) {
      loadError = "LISTSを読み込めませんでした。migrationとDATABASE_URLを確認してください。";
    }
  }

  return (
    <AppFrame activePath="lists" roleLabel="owner" userLabel={ownerLogin}>
      <main className="library-page">
        <section className="library-intro">
          <p className="eyebrow">LISTS</p>
          <h1>保存した表現を選ぶ</h1>
          <p>ジャンル、シチュエーション、レベル、更新日で絞り込み、EXPORTする表現を選択します。</p>
        </section>
        {loadError ? <p className="error-note">{loadError}</p> : <ExpressionLibrary entries={entries} />}
      </main>
    </AppFrame>
  );
}
