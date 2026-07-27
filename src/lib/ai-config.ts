export type OwnerAiConfig = {
  apiKey: string;
  model: "grok-4.3";
  reasoningEffort: "low" | "medium" | "high";
};

const defaultOwnerModel = "grok-4.3";
const allowedOwnerModels = new Set(["grok-4.3"]);
const defaultReasoningEffort: OwnerAiConfig["reasoningEffort"] = "medium";
const allowedReasoningEfforts = new Set<OwnerAiConfig["reasoningEffort"]>([
  "low",
  "medium",
  "high",
]);

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
  const configuredEffort = process.env.OWNER_AI_EFFORT?.trim();

  if (!apiKey) {
    throw new MissingAiApiKeyError("owner");
  }

  if (!allowedOwnerModels.has(model)) {
    throw new AiModelNotAllowedError("owner", model);
  }

  return {
    apiKey,
    model: defaultOwnerModel,
    reasoningEffort: allowedReasoningEfforts.has(
      configuredEffort as OwnerAiConfig["reasoningEffort"],
    )
      ? configuredEffort as OwnerAiConfig["reasoningEffort"]
      : defaultReasoningEffort,
  };
}

export function isOwnerAiConfigured(): boolean {
  return Boolean(process.env.OWNER_AI_KEY?.trim());
}

export function getOwnerAiModelLabel(): string {
  return process.env.OWNER_AI_MODEL?.trim() || defaultOwnerModel;
}
