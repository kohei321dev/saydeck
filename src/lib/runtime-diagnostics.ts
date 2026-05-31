import {
  isAuthConfigured,
  isGitHubAuthConfigured,
  isGoogleAuthConfigured,
  ownerGithubUsername,
} from "@/lib/auth";
import {
  getCardStoreLocation,
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
  };
  cards: {
    persistenceConfigured: boolean;
    storeLocation: string;
  };
  database: {
    configured: boolean;
  };
};

export function getRuntimeDiagnostics(): RuntimeDiagnostics {
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
    },
    cards: {
      persistenceConfigured: isCardPersistenceConfigured(),
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
