import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
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
import { expressionEntriesToSceneCards } from "@/lib/expression-scene-cards";
import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import { listExpressionEntries } from "@/lib/expression-store";
import { mergeSceneCards } from "@/lib/scenes";

export const dynamic = "force-dynamic";

/**
 * Render the SayDeck home page, fetching scene cards and enforcing dev, auth, and permission gates.
 *
 * When dev-auth-bypass is enabled, returns a dev view with an owner dev chip and cloud sync controlled by database configuration.
 * If authentication is not configured, redirects to "/signin?setup=1".
 * If no session is present, redirects to "/signin".
 * If the session cannot use practice, redirects to "/denied".
 * Otherwise returns the main app frame showing the owner session and a configured ScenePractice with cloud sync enabled when a database is configured.
 *
 * @returns The page's JSX element.
 */
export default async function HomePage() {
  const [sampleCards, storedCards, expressionCards] = await Promise.all([
    getSampleSceneCards(),
    getStoredSceneCards(),
    getRegisteredExpressionCards(),
  ]);
  const cards = mergeSceneCards(sampleCards, storedCards, expressionCards);
  const persistedCardIds = storedCards.map((card) => card.id);
  const cardPersistenceConfigured = isCardPersistenceConfigured();
  const databaseConfigured = isDatabaseConfigured();

  if (isDevAuthBypassEnabled()) {
    return (
      <div className="app-frame">
        <header className="topbar">
          <div className="brand">
            <Image
              alt=""
              aria-hidden="true"
              className="brand-icon"
              height={28}
              src="/icon.svg"
              width={28}
            />
            <strong>SayDeck</strong>
          </div>
          <div className="topbar-actions">
            <Link className="app-nav-link" href="/create">表現を作る</Link>
            <Link className="app-nav-link" href="/library">Library</Link>
            <span className="user-chip">@{ownerGithubUsername} dev</span>
            <SignOutButton />
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

  const isOwner = isOwnerSession(session);

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand">
          <Image
            alt=""
            aria-hidden="true"
            className="brand-icon"
            height={28}
            src="/icon.svg"
            width={28}
          />
          <strong>SayDeck</strong>
      </div>
      <div className="topbar-actions">
          <Link className="app-nav-link" href="/create">表現を作る</Link>
          <Link className="app-nav-link" href="/library">Library</Link>
          <span className="user-chip">
            @{session.user.githubLogin ?? session.user.email ?? "unknown"}{" "}
            {session.user.role ?? "viewer"}
          </span>
          <SignOutButton />
        </div>
      </header>
      <ScenePractice
        cardPersistenceConfigured={cardPersistenceConfigured}
        canAddCards={isOwner}
        canUseCloudSync={isOwner && databaseConfigured}
        cards={cards}
        persistedCardIds={isOwner ? persistedCardIds : []}
      />
    </div>
  );
}

async function getRegisteredExpressionCards() {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return [];
  }

  try {
    return expressionEntriesToSceneCards(await listExpressionEntries(ownerLogin));
  } catch {
    return [];
  }
}
