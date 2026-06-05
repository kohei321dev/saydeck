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
  getSampleSceneCards,
  getStoredSceneCards,
  isCardPersistenceConfigured,
} from "@/lib/card-store";
import { isDatabaseConfigured } from "@/lib/db";
import { mergeSceneCards } from "@/lib/scenes";

export const dynamic = "force-dynamic";

/**
 * Render the Scene Builder home page, fetching scene cards and enforcing dev, auth, and permission gates.
 *
 * When dev-auth-bypass is enabled, returns a dev view with an owner dev chip and cloud sync controlled by database configuration.
 * If authentication is not configured, redirects to "/signin?setup=1".
 * If no session is present, redirects to "/signin".
 * If the session cannot use practice, redirects to "/denied".
 * Otherwise returns the main app frame showing the user's role and a configured ScenePractice (owner vs guest) with cloud sync enabled only for owners when a database is configured.
 *
 * @returns The page's JSX element.
 */
export default async function HomePage() {
  const [sampleCards, storedCards] = await Promise.all([
    getSampleSceneCards(),
    getStoredSceneCards(),
  ]);
  const cards = mergeSceneCards(sampleCards, storedCards);
  const persistedCardIds = storedCards.map((card) => card.id);
  const cardPersistenceConfigured = isCardPersistenceConfigured();
  const databaseConfigured = isDatabaseConfigured();

  if (isDevAuthBypassEnabled()) {
    return (
      <div className="app-frame">
        <header className="topbar">
          <div className="brand">
            <strong>Scene Builder</strong>
            <span>話したいシチュエーションで使える英文を作る練習</span>
          </div>
          <div className="topbar-actions">
            <span className="user-chip">@{ownerGithubUsername} dev</span>
          </div>
        </header>
        <ScenePractice
          cardPersistenceConfigured={cardPersistenceConfigured}
          canAddCards
          canUseCloudSync={databaseConfigured}
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
          <span>話したいシチュエーションで使える英文を作る練習</span>
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
        canUseCloudSync={role === "owner" && databaseConfigured}
        cards={cards}
        persistedCardIds={role === "owner" ? persistedCardIds : []}
      />
    </div>
  );
}
