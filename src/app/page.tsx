import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ScenePractice } from "@/components/scene-practice";
import { SignOutButton } from "@/components/sign-in-button";
import {
  authOptions,
  canUsePractice,
  isAuthConfigured,
  isDevAuthBypassEnabled,
  isOwnerSession,
  ownerGithubUsername,
} from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { getSceneCards } from "@/lib/scenes";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cards = await getSceneCards();

  if (isDevAuthBypassEnabled()) {
    return (
      <div className="app-frame">
        <header className="topbar">
          <div className="brand">
            <strong>Scene Builder</strong>
            <span>場面から英文を組み立てる練習</span>
          </div>
          <div className="topbar-actions">
            <span className="user-chip">@{ownerGithubUsername} dev</span>
          </div>
        </header>
        <ScenePractice
          canAddCards
          canUseCloudSync={isDatabaseConfigured()}
          cards={cards}
        />
      </div>
    );
  }

  if (!isAuthConfigured()) {
    redirect("/signin?setup=1");
  }

  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/signin");
  }

  if (!canUsePractice(session)) {
    redirect("/denied");
  }

  const role = isOwnerSession(session) ? "owner" : "guest";

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand">
          <strong>Scene Builder</strong>
          <span>場面から英文を組み立てる練習</span>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">
            {role === "owner"
              ? `@${session.user.githubLogin} owner`
              : `${session.user.email ?? session.user.googleEmail ?? "guest"} guest`}
          </span>
          <SignOutButton />
        </div>
      </header>
      <ScenePractice
        canAddCards={role === "owner"}
        canUseCloudSync={role === "owner" && isDatabaseConfigured()}
        cards={cards}
      />
    </div>
  );
}
