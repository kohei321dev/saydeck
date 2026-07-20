import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppFrame } from "@/components/app-frame";
import { ExpressionLibrary } from "@/components/expression-library";
import { authOptions, isDevAuthBypassEnabled, isOwnerSession, ownerGithubUsername } from "@/lib/auth";
import type { ExpressionEntryDetail } from "@/lib/expression-types";
import { ExpressionDatabaseUnavailableError, listExpressionEntries } from "@/lib/expression-store";

export const dynamic = "force-dynamic";

export default async function ExpressionLibraryPage() {
  let userLabel = ownerGithubUsername;
  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/signin");
    if (!isOwnerSession(session)) redirect("/denied");
    userLabel = session.user.githubLogin ?? ownerGithubUsername;
  }

  let entries: ExpressionEntryDetail[] = [];
  let loadError: string | null = null;
  try {
    entries = await listExpressionEntries(userLabel);
  } catch (error) {
    if (!(error instanceof ExpressionDatabaseUnavailableError)) {
      loadError = "ライブラリを読み込めませんでした。migrationとDATABASE_URLを確認してください。";
    }
  }

  return (
    <AppFrame activePath="library" roleLabel="owner" userLabel={userLabel}>
      <main className="library-page">
        <section className="library-intro">
          <p className="eyebrow">LIBRARY</p>
          <h1>登録した表現</h1>
          <p>英文候補、タグ、登録日、音声再生を確認できます。Anki exportではカード・タグ・期間を指定できます。</p>
        </section>
        {loadError ? <p className="error-note">{loadError}</p> : <ExpressionLibrary entries={entries} />}
      </main>
    </AppFrame>
  );
}
