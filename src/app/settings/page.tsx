import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AiProviderSettingsPanel } from "@/components/ai-provider-settings-panel";
import { AppFrame } from "@/components/app-frame";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { authOptions, isDevAuthBypassEnabled, isOwnerSession, ownerGithubUsername } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let ownerLogin = ownerGithubUsername;
  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/signin");
    if (!isOwnerSession(session)) redirect("/denied");
    ownerLogin = session.user.githubLogin ?? ownerGithubUsername;
  }

  const settings = await getAiProviderSettings(ownerLogin);

  return (
    <AppFrame activePath="settings" roleLabel="owner" userLabel={ownerLogin}>
      <main className="settings-page">
        <header className="settings-intro">
          <p className="eyebrow">SETTINGS</p>
          <h1>AI provider</h1>
          <p>xAIとSakana AIの接続状態を確認し、次回の英語表現生成に使うproviderを選択します。</p>
        </header>
        <AiProviderSettingsPanel initialSettings={settings} />
      </main>
    </AppFrame>
  );
}
