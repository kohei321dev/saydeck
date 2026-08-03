import { ownerGithubUsername } from "@/lib/auth";

export type ChatCapturePlatform = "slack" | "discord";

export type ChatCaptureAuthorization =
  | {
      authorized: true;
      ownerLogin: string;
      platform: ChatCapturePlatform;
      platformUserId: string;
      platformWorkspaceId: string;
    }
  | {
      authorized: false;
      reason: "platform_not_supported" | "owner_not_configured" | "owner_mismatch" | "workspace_mismatch";
    };

export function authorizeChatCapture(input: {
  platform: string;
  platformUserId: string;
  raw?: unknown;
}): ChatCaptureAuthorization {
  if (input.platform !== "slack" && input.platform !== "discord") {
    return { authorized: false, reason: "platform_not_supported" };
  }

  const platform = input.platform;
  const configuredUserId = platform === "slack"
    ? process.env.SLACK_OWNER_USER_ID?.trim()
    : process.env.DISCORD_OWNER_USER_ID?.trim();

  if (!configuredUserId) {
    return { authorized: false, reason: "owner_not_configured" };
  }

  if (configuredUserId !== input.platformUserId) {
    return { authorized: false, reason: "owner_mismatch" };
  }

  const platformWorkspaceId = findPlatformWorkspaceId(platform, input.raw);
  const configuredWorkspaceId = platform === "slack"
    ? process.env.SLACK_OWNER_TEAM_ID?.trim()
    : process.env.DISCORD_OWNER_GUILD_ID?.trim();

  if (configuredWorkspaceId && configuredWorkspaceId !== platformWorkspaceId) {
    return { authorized: false, reason: "workspace_mismatch" };
  }

  return {
    authorized: true,
    ownerLogin: ownerGithubUsername,
    platform,
    platformUserId: input.platformUserId,
    platformWorkspaceId,
  };
}

export function isSlackChatCaptureConfigured(): boolean {
  return Boolean(
    process.env.SLACK_BOT_TOKEN?.trim()
    && process.env.SLACK_SIGNING_SECRET?.trim()
    && process.env.SLACK_OWNER_USER_ID?.trim(),
  );
}

export function isDiscordChatCaptureConfigured(): boolean {
  return Boolean(
    process.env.DISCORD_BOT_TOKEN?.trim()
    && process.env.DISCORD_PUBLIC_KEY?.trim()
    && process.env.DISCORD_APPLICATION_ID?.trim()
    && process.env.DISCORD_OWNER_USER_ID?.trim(),
  );
}

function findPlatformWorkspaceId(
  platform: ChatCapturePlatform,
  raw: unknown,
): string {
  const keys = platform === "slack"
    ? ["team_id", "teamId", "team"]
    : ["guild_id", "guildId"];

  return findNestedString(raw, keys, 0) ?? "";
}

function findNestedString(
  value: unknown,
  keys: string[],
  depth: number,
): string | undefined {
  if (!value || typeof value !== "object" || depth > 4) return undefined;

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const candidate of Object.values(record)) {
    const nested = findNestedString(candidate, keys, depth + 1);
    if (nested) return nested;
  }

  return undefined;
}
