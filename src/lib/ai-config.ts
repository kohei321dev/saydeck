export type OwnerAiConfig = {
  apiKey: string;
  model: "grok-4.3";
  reasoningEffort: "none";
};

export type ViewerAiConfig = {
  apiKey: string;
  model: "claude-haiku-4-5-20251001";
  maxTokens: 700;
};

const defaultOwnerModel = "grok-4.3";
const defaultViewerModel = "claude-haiku-4-5-20251001";
const allowedOwnerModels = new Set(["grok-4.3"]);
const allowedViewerModels = new Set(["claude-haiku-4-5-20251001"]);

export class MissingAiApiKeyError extends Error {
  constructor(provider: "owner" | "viewer") {
    super(`${provider} AI API key is not configured.`);
    this.name = "MissingAiApiKeyError";
  }
}

export class AiModelNotAllowedError extends Error {
  constructor(provider: "owner" | "viewer", model: string) {
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

export function getViewerAiConfig(): ViewerAiConfig {
  const apiKey = process.env.VIEWER_AI_KEY?.trim();
  const model = process.env.VIEWER_AI_MODEL?.trim() || "";

  if (!apiKey) {
    throw new MissingAiApiKeyError("viewer");
  }

  if (!allowedViewerModels.has(model)) {
    throw new AiModelNotAllowedError("viewer", model);
  }

  return {
    apiKey,
    model: defaultViewerModel,
    maxTokens: 700,
  };
}

export function isOwnerAiConfigured(): boolean {
  return Boolean(process.env.OWNER_AI_KEY?.trim());
}

export function isViewerAiConfigured(): boolean {
  return Boolean(process.env.VIEWER_AI_KEY?.trim());
}

export function getOwnerAiModelLabel(): string {
  return process.env.OWNER_AI_MODEL?.trim() || defaultOwnerModel;
}

export function getViewerAiModelLabel(): string {
  return process.env.VIEWER_AI_MODEL?.trim() || "(unset)";
}
