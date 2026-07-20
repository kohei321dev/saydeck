import { getServerSession } from "next-auth";

import {
  authOptions,
  isDevAuthBypassEnabled,
  isOwnerSession,
  ownerGithubUsername,
} from "@/lib/auth";

/**
 * Resolve the owner identity on the server. The client never gets to choose
 * the owner_login value used by the expression domain.
 */
export async function getExpressionOwnerLogin(): Promise<string | null> {
  if (isDevAuthBypassEnabled()) {
    return ownerGithubUsername;
  }

  const session = await getServerSession(authOptions);

  if (!session || !isOwnerSession(session)) {
    return null;
  }

  return session.user.githubLogin ?? null;
}
