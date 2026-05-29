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
import {
  getStoredSceneCards,
  isCardPersistenceConfigured,
} from "@/lib/card-store";
import { getStaticSceneCards, mergeSceneCards } from "@/lib/scenes";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [staticCards, storedCards] = await Promise.all([
    getStaticSceneCards(),
    getStoredSceneCards(),
  ]);
  const cards = mergeSceneCards(staticCards, storedCards);
  const persistedCardIds = storedCards.map((card) => card.id);
  const cardPersistenceConfigured = isCardPersistenceConfigured();

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
          cardPersistenceConfigured={cardPersistenceConfigured}
          canAddCards
          cards={cards}
          persistedCardIds={persistedCardIds}
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
        cardPersistenceConfigured={cardPersistenceConfigured}
        canAddCards={role === "owner"}
        cards={cards}
        persistedCardIds={role === "owner" ? persistedCardIds : []}
      />
    </div>
  );
}
