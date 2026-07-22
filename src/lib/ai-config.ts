export type OwnerAiConfig = {
  apiKey: string;
  model: "grok-4.3";
  reasoningEffort: "none";
};

const defaultOwnerModel = "grok-4.3";
const allowedOwnerModels = new Set(["grok-4.3"]);

export class MissingAiApiKeyError extends Error {
  constructor(provider: "owner") {
    super(`${provider} AI API key is not configured.`);
    this.name = "MissingAiApiKeyError";
  }
}

export class AiModelNotAllowedError extends Error {
  constructor(provider: "owner", model: string) {
    super(`${provider} AI model is not allowed: ${model || "(empty)"}`);
    this.name = "AiModelNotAllowedError";
  }
}

export function getOwnerAiConfig(): OwnerAiConfig {
  const apiKey = process.env.OWNER_AI_KEY?.trim();
  const model = process.env.OWNER_AI_MODEL?.trim() || defaultOwnerModel;

  if (!apiKey) {
    throw new MissingAiApiKeyError("owner");
  }

  if (!allowedOwnerModels.has(model)) {
    throw new AiModelNotAllowedError("owner", model);
  }

  return {
    apiKey,
    model: defaultOwnerModel,
    reasoningEffort: "none",
  };
}

export function isOwnerAiConfigured(): boolean {
  return Boolean(process.env.OWNER_AI_KEY?.trim());
}

export function getOwnerAiModelLabel(): string {
  return process.env.OWNER_AI_MODEL?.trim() || defaultOwnerModel;
}
