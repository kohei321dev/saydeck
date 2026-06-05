import {
  isAuthConfigured,
  isGitHubAuthConfigured,
  isGoogleAuthConfigured,
  isPreviewAuthBypassConfigured,
  ownerGithubUsername,
} from "@/lib/auth";
import {
  getCardStoreLocation,
  isCardStoreReady,
  isCardPersistenceConfigured,
} from "@/lib/card-store";
import { isDatabaseConfigured } from "@/lib/db";

export type RuntimeDiagnostics = {
  ai: {
    apiKeyConfigured: boolean;
    model: string;
    reasoningEffort: "none" | "low" | "medium" | "high";
  };
  auth: {
    configured: boolean;
    githubConfigured: boolean;
    googleConfigured: boolean;
    nextAuthUrlHost: string | null;
    ownerGithubUsername: string;
    previewBypassConfigured: boolean;
    vercelEnv: string | null;
  };
  cards: {
    persistenceConfigured: boolean;
    schemaReady: boolean;
    storeLocation: string;
  };
  database: {
    configured: boolean;
  };
};

/**
 * Collects current runtime configuration diagnostics for AI, authentication, and the database.
 *
 * @returns A `RuntimeDiagnostics` object containing `ai`, `auth`, and `database` sections that reflect the process environment and helper-detected configuration status.
 */
export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  return {
    ai: {
      apiKeyConfigured: Boolean(process.env.GROK_API_KEY || process.env.XAI_API_KEY),
      model: process.env.GROK_MODEL || process.env.XAI_MODEL || "grok-4.3",
      reasoningEffort: getReasoningEffort(),
    },
    auth: {
      configured: isAuthConfigured(),
      githubConfigured: isGitHubAuthConfigured(),
      googleConfigured: isGoogleAuthConfigured(),
      nextAuthUrlHost: getNextAuthUrlHost(),
      ownerGithubUsername,
      previewBypassConfigured: isPreviewAuthBypassConfigured(),
      vercelEnv: process.env.VERCEL_ENV || null,
    },
    cards: {
      persistenceConfigured: isCardPersistenceConfigured(),
      schemaReady: await isCardStoreReady(),
      storeLocation: getCardStoreLocation(),
    },
    database: {
      configured: isDatabaseConfigured(),
    },
  };
}

function getReasoningEffort(): "none" | "low" | "medium" | "high" {
  const effort = process.env.GROK_REASONING_EFFORT || process.env.XAI_REASONING_EFFORT;

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

function getNextAuthUrlHost(): string | null {
  const value = process.env.NEXTAUTH_URL;

  if (!value) {
    return null;
  }

  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}
