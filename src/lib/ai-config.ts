export const aiProviderCodes = ["xai", "sakana"] as const;
export type AiProviderCode = (typeof aiProviderCodes)[number];

export type AiProviderConfig = {
  provider: AiProviderCode;
  label: string;
  apiKey: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high" | "xhigh" | "max";
  responsesUrl: string;
  modelsUrl: string;
};

export type AiProviderDescriptor = {
  provider: AiProviderCode;
  label: string;
  model: string;
  configured: boolean;
};

export type OwnerAiConfig = AiProviderConfig;

const defaultXaiModel = "grok-4.3";
const allowedXaiModels = new Set([defaultXaiModel]);
const defaultXaiEffort: AiProviderConfig["reasoningEffort"] = "medium";
const allowedXaiEfforts = new Set<AiProviderConfig["reasoningEffort"]>([
  "low",
  "medium",
  "high",
]);

const defaultSakanaModel = "fugu";
const allowedSakanaModels = new Set([
  "fugu",
  "fugu-ultra",
  "fugu-ultra-20260615",
  "fugu-ultra-v1.0",
  "fugu-ultra-v1.1",
]);
const defaultSakanaEffort: AiProviderConfig["reasoningEffort"] = "high";
const allowedSakanaEfforts = new Set<AiProviderConfig["reasoningEffort"]>([
  "high",
  "xhigh",
  "max",
]);

export class MissingAiApiKeyError extends Error {
  constructor(readonly provider: AiProviderCode) {
    super(`${provider} AI API key is not configured.`);
    this.name = "MissingAiApiKeyError";
  }
}

export class AiModelNotAllowedError extends Error {
  constructor(readonly provider: AiProviderCode, model: string) {
    super(`${provider} AI model is not allowed: ${model || "(empty)"}`);
    this.name = "AiModelNotAllowedError";
  }
}

export function isAiProviderCode(value: unknown): value is AiProviderCode {
  return typeof value === "string" && aiProviderCodes.includes(value as AiProviderCode);
}

export function getAiProviderDescriptor(provider: AiProviderCode): AiProviderDescriptor {
  if (provider === "sakana") {
    return {
      provider,
      label: "Sakana AI",
      model: process.env.SAKANA_AI_MODEL?.trim() || defaultSakanaModel,
      configured: Boolean(process.env.SAKANA_API_KEY?.trim()),
    };
  }

  return {
    provider,
    label: "xAI",
    model: process.env.OWNER_AI_MODEL?.trim() || defaultXaiModel,
    configured: Boolean(process.env.OWNER_AI_KEY?.trim()),
  };
}

export function listAiProviderDescriptors(): AiProviderDescriptor[] {
  return aiProviderCodes.map(getAiProviderDescriptor);
}

export function getAiProviderConfig(provider: AiProviderCode): AiProviderConfig {
  if (provider === "sakana") {
    const apiKey = process.env.SAKANA_API_KEY?.trim();
    const model = process.env.SAKANA_AI_MODEL?.trim() || defaultSakanaModel;
    const effort = process.env.SAKANA_AI_EFFORT?.trim();

    if (!apiKey) throw new MissingAiApiKeyError(provider);
    if (!allowedSakanaModels.has(model)) throw new AiModelNotAllowedError(provider, model);

    return {
      provider,
      label: "Sakana AI",
      apiKey,
      model,
      reasoningEffort: allowedSakanaEfforts.has(effort as AiProviderConfig["reasoningEffort"])
        ? effort as AiProviderConfig["reasoningEffort"]
        : defaultSakanaEffort,
      responsesUrl: "https://api.sakana.ai/v1/responses",
      modelsUrl: "https://api.sakana.ai/v1/models",
    };
  }

  const apiKey = process.env.OWNER_AI_KEY?.trim();
  const model = process.env.OWNER_AI_MODEL?.trim() || defaultXaiModel;
  const effort = process.env.OWNER_AI_EFFORT?.trim();

  if (!apiKey) throw new MissingAiApiKeyError(provider);
  if (!allowedXaiModels.has(model)) throw new AiModelNotAllowedError(provider, model);

  return {
    provider,
    label: "xAI",
    apiKey,
    model,
    reasoningEffort: allowedXaiEfforts.has(effort as AiProviderConfig["reasoningEffort"])
      ? effort as AiProviderConfig["reasoningEffort"]
      : defaultXaiEffort,
    responsesUrl: "https://api.x.ai/v1/responses",
    modelsUrl: "https://api.x.ai/v1/models",
  };
}

/** Backward-compatible xAI accessor for diagnostics and older callers. */
export function getOwnerAiConfig(): OwnerAiConfig {
  return getAiProviderConfig("xai");
}

export function isOwnerAiConfigured(): boolean {
  return Boolean(process.env.OWNER_AI_KEY?.trim());
}

export function getOwnerAiModelLabel(): string {
  return getAiProviderDescriptor("xai").model;
}
