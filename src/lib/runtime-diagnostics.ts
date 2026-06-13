import {
  isAuthConfigured,
  isGitHubAuthConfigured,
  ownerGithubUsername,
} from "@/lib/auth";
import {
  getCardStoreLocation,
  isCardStoreReady,
  isCardPersistenceConfigured,
} from "@/lib/card-store";
import { isDatabaseConfigured } from "@/lib/db";
import { getPracticeStorageReadiness } from "@/lib/practice-notes";

export type RuntimeDiagnostics = {
  ai: {
    apiKeyConfigured: boolean;
    model: string;
    reasoningEffort: "none" | "low" | "medium" | "high";
  };
  auth: {
    configured: boolean;
    githubConfigured: boolean;
    ownerGithubUsername: string;
  };
  cards: {
    persistenceConfigured: boolean;
    schemaReady: boolean;
    storeLocation: string;
  };
  database: {
    configured: boolean;
  };
  practiceStorage: {
    persistenceConfigured: boolean;
    practiceAttemptsReady: boolean;
    savedNotesReady: boolean;
  };
};

/**
 * Collects current runtime configuration diagnostics for AI, authentication, and the database.
 *
 * @returns A `RuntimeDiagnostics` object containing `ai`, `auth`, and `database` sections that reflect the process environment and helper-detected configuration status.
 */
export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  const databaseConfigured = isDatabaseConfigured();
  const practiceStorageReadiness = await getPracticeStorageReadiness();

  return {
    ai: {
      apiKeyConfigured: Boolean(process.env.GROK_API_KEY),
      model: process.env.GROK_MODEL || "grok-4.3",
      reasoningEffort: getReasoningEffort(),
    },
    auth: {
      configured: isAuthConfigured(),
      githubConfigured: isGitHubAuthConfigured(),
      ownerGithubUsername,
    },
    cards: {
      persistenceConfigured: isCardPersistenceConfigured(),
      schemaReady: await isCardStoreReady(),
      storeLocation: getCardStoreLocation(),
    },
    database: {
      configured: databaseConfigured,
    },
    practiceStorage: {
      persistenceConfigured: databaseConfigured,
      practiceAttemptsReady: practiceStorageReadiness.practiceAttemptsReady,
      savedNotesReady: practiceStorageReadiness.savedNotesReady,
    },
  };
}

function getReasoningEffort(): "none" | "low" | "medium" | "high" {
  const effort = process.env.GROK_REASONING_EFFORT;

  if (
    effort === "none" ||
    effort === "low" ||
    effort === "medium" ||
    effort === "high"
  ) {
    return effort;
  }

  return "none";
}
