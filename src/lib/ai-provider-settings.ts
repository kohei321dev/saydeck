import {
  AiModelNotAllowedError,
  getAiProviderConfig,
  isAiProviderCode,
  listAiProviderDescriptors,
  MissingAiApiKeyError,
} from "@/lib/ai-config";
import type { AiProviderCode, AiProviderConfig } from "@/lib/ai-config";
import { getSql } from "@/lib/db";
import { logServerError } from "@/lib/log-redaction";

export type AiProviderSettings = {
  activeProvider: AiProviderCode;
  providers: ReturnType<typeof listAiProviderDescriptors>;
};

export type AiProviderProbe = {
  provider: AiProviderCode;
  model: string;
  configured: boolean;
  connected: boolean;
  status: number | null;
};

export class AiProviderNotConfiguredError extends Error {
  constructor(readonly provider: AiProviderCode) {
    super(`${provider} AI provider is not configured.`);
    this.name = "AiProviderNotConfiguredError";
  }
}

export async function getAiProviderSettings(ownerLogin: string): Promise<AiProviderSettings> {
  const sql = getSql();
  const rows = await sql<{ active_provider: string }[]>`
    select active_provider
    from owner_ai_settings
    where owner_login = ${ownerLogin}
    limit 1
  `;
  const stored = rows[0]?.active_provider;

  return {
    activeProvider: isAiProviderCode(stored) ? stored : "xai",
    providers: listAiProviderDescriptors(),
  };
}

export async function setActiveAiProvider(
  ownerLogin: string,
  provider: AiProviderCode,
): Promise<AiProviderSettings> {
  const descriptor = listAiProviderDescriptors().find((item) => item.provider === provider);
  if (!descriptor?.configured) {
    throw new AiProviderNotConfiguredError(provider);
  }

  // Validate model allowlists before persisting a provider that cannot be used.
  getAiProviderConfig(provider);

  const sql = getSql();
  await sql`
    insert into owner_ai_settings (owner_login, active_provider)
    values (${ownerLogin}, ${provider})
    on conflict (owner_login) do update set
      active_provider = excluded.active_provider,
      updated_at = now()
  `;

  return getAiProviderSettings(ownerLogin);
}

export async function resolveGenerationAiConfig(ownerLogin: string): Promise<AiProviderConfig> {
  const settings = await getAiProviderSettings(ownerLogin);
  return getAiProviderConfig(settings.activeProvider);
}

export async function probeAiProvider(provider: AiProviderCode): Promise<AiProviderProbe> {
  const descriptor = listAiProviderDescriptors().find((item) => item.provider === provider);
  if (!descriptor?.configured) {
    return {
      provider,
      model: descriptor?.model ?? "",
      configured: false,
      connected: false,
      status: null,
    };
  }

  let config: AiProviderConfig;
  try {
    config = getAiProviderConfig(provider);
  } catch (error) {
    if (error instanceof MissingAiApiKeyError || error instanceof AiModelNotAllowedError) {
      return {
        provider,
        model: descriptor.model,
        configured: descriptor.configured,
        connected: false,
        status: null,
      };
    }
    throw error;
  }

  try {
    const response = await fetch(config.modelsUrl, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return {
      provider,
      model: config.model,
      configured: true,
      connected: response.ok,
      status: response.status,
    };
  } catch (error) {
    logServerError("Failed to probe AI provider.", error, { provider });
    return {
      provider,
      model: config.model,
      configured: true,
      connected: false,
      status: null,
    };
  }
}
