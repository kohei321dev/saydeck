import { createDiscordAdapter } from "@chat-adapter/discord";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-pg";
import {
  Actions,
  Button,
  Card,
  CardText,
  Chat,
  LinkButton,
} from "chat";
import type {
  ActionEvent,
  Adapter,
  Author,
  Message,
  SentMessage,
  SlashCommandEvent,
  Thread,
} from "chat";

import { isAiProviderCode } from "@/lib/ai-config";
import {
  AiProviderNotConfiguredError,
  getAiProviderSettings,
  setActiveAiProvider,
} from "@/lib/ai-provider-settings";
import {
  authorizeChatCapture,
  isDiscordChatCaptureConfigured,
  isSlackChatCaptureConfigured,
} from "@/lib/chat-capture-auth";
import type { ChatCapturePlatform } from "@/lib/chat-capture-auth";
import {
  approveChatCardDraft,
  createChatCardDraft,
  rejectChatCardDraft,
} from "@/lib/chat-card-service";
import type { ChatCardRequest } from "@/lib/chat-card-store";
import type { ExpressionEntryDetail, SentenceVariant } from "@/lib/expression-types";
import { logServerError } from "@/lib/log-redaction";

const actionRegister = "saydeck_register";
const actionReject = "saydeck_reject";
const actionModelXai = "saydeck_model_xai";
const actionModelSakana = "saydeck_model_sakana";
const maxInputLength = 2_000;
const productionUrl = "https://scene-builder-tau.vercel.app";

type SayDeckChatRuntime = {
  bot: Chat<Record<string, Adapter>>;
  platforms: Set<ChatCapturePlatform>;
};

let runtime: SayDeckChatRuntime | null | undefined;

export function getSayDeckChatRuntime(): SayDeckChatRuntime | null {
  if (runtime !== undefined) return runtime;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    runtime = null;
    return runtime;
  }

  const adapters: Record<string, Adapter> = {};
  const platforms = new Set<ChatCapturePlatform>();
  if (isSlackChatCaptureConfigured()) {
    adapters.slack = createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      mode: "webhook",
      nativeStreaming: false,
      userName: "saydeck",
    });
    platforms.add("slack");
  }
  if (isDiscordChatCaptureConfigured()) {
    adapters.discord = createDiscordAdapter({
      applicationId: process.env.DISCORD_APPLICATION_ID,
      botToken: process.env.DISCORD_BOT_TOKEN,
      publicKey: process.env.DISCORD_PUBLIC_KEY,
      userName: "saydeck",
    });
    platforms.add("discord");
  }
  if (platforms.size === 0) {
    runtime = null;
    return runtime;
  }

  const bot = new Chat<Record<string, Adapter>>({
    userName: "saydeck",
    adapters,
    state: createPostgresState({ url: databaseUrl, keyPrefix: "saydeck-chat" }),
    logger: "warn",
    concurrency: "drop",
    dedupeTtlMs: 60 * 60 * 1_000,
  });
  registerHandlers(bot);
  runtime = { bot, platforms };
  return runtime;
}

function registerHandlers(bot: Chat<Record<string, Adapter>>): void {
  bot.onNewMention(async (thread, message) => {
    await handleMessageCapture(thread, message);
  });

  bot.onDirectMessage(async (thread, message) => {
    await handleMessageCapture(thread, message);
  });

  bot.onSlashCommand("/saydeck", async (event) => {
    await handleSlashCapture(bot, event);
  });

  bot.onAction([actionRegister, actionReject, actionModelXai, actionModelSakana], async (event) => {
    await handleApprovalAction(bot, event);
  });
}

async function handleMessageCapture(thread: Thread, message: Message): Promise<void> {
  const platform = asPlatform(thread.adapter.name);
  if (!platform) return;

  const authorization = authorizeChatCapture({
    platform,
    platformUserId: message.author.userId,
    raw: message.raw,
  });
  if (!authorization.authorized) {
    await replyUnauthorized(thread, message.author);
    return;
  }

  const inputJa = cleanInput(message.text);
  if (!isValidInput(inputJa)) {
    await thread.post(inputErrorMessage(inputJa));
    return;
  }

  const pending = await thread.post("英語表現を生成しています…");
  await generateAndRender({
    platform,
    ownerLogin: authorization.ownerLogin,
    platformUserId: authorization.platformUserId,
    platformWorkspaceId: authorization.platformWorkspaceId,
    platformChannelId: thread.channelId,
    platformThreadId: thread.id,
    sourceEventId: `${platform}:message:${message.id}`,
    inputJa,
    pending,
  });
}

async function handleSlashCapture(
  bot: Chat<Record<string, Adapter>>,
  event: SlashCommandEvent,
): Promise<void> {
  const platform = asPlatform(event.adapter.name);
  if (!platform) return;

  const authorization = authorizeChatCapture({
    platform,
    platformUserId: event.user.userId,
    raw: event.raw,
  });
  if (!authorization.authorized) {
    await event.channel.postEphemeral(
      event.user,
      "この操作はSayDeck ownerだけが利用できます。",
      { fallbackToDM: true },
    );
    return;
  }

  const inputJa = cleanInput(event.text);
  const subcommand = inputJa.toLowerCase();
  if (subcommand === "model" || subcommand === "modelchange") {
    const settings = await getAiProviderSettings(authorization.ownerLogin);
    await event.channel.postEphemeral(
      event.user,
      subcommand === "model" ? modelStatusCard(settings) : modelChangeCard(settings),
      { fallbackToDM: true },
    );
    return;
  }

  if (!isValidInput(inputJa)) {
    await event.channel.postEphemeral(
      event.user,
      inputErrorMessage(inputJa),
      { fallbackToDM: true },
    );
    return;
  }

  let pending: SentMessage;
  let platformThreadId = event.channel.id;
  if (platform === "slack") {
    const root = await event.channel.post(`SayDeck受付: ${truncate(inputJa, 120)}`);
    const thread = bot.thread(root.threadId);
    platformThreadId = thread.id;
    pending = await thread.post("英語表現を生成しています…");
  } else {
    pending = await event.channel.post("英語表現を生成しています…");
    platformThreadId = pending.threadId;
  }

  await generateAndRender({
    platform,
    ownerLogin: authorization.ownerLogin,
    platformUserId: authorization.platformUserId,
    platformWorkspaceId: authorization.platformWorkspaceId,
    platformChannelId: event.channel.id,
    platformThreadId,
    sourceEventId: `${platform}:slash:${findNestedString(event.raw, ["id", "trigger_id", "triggerId"]) ?? crypto.randomUUID()}`,
    inputJa,
    pending,
  });
}

async function generateAndRender(input: {
  platform: ChatCapturePlatform;
  ownerLogin: string;
  platformUserId: string;
  platformWorkspaceId: string;
  platformChannelId: string;
  platformThreadId: string;
  sourceEventId: string;
  inputJa: string;
  pending: SentMessage;
}): Promise<void> {
  try {
    const result = await createChatCardDraft(input);
    await input.pending.edit(cardForRequest(result.request, result.entry));
  } catch (error) {
    logServerError("Failed to create a SayDeck chat draft.", error, {
      platform: input.platform,
      sourceEventId: input.sourceEventId,
    });
    await input.pending.edit(
      "英語候補の生成に失敗しました。AI設定、利用上限、migration 0013、DATABASE_URLを確認して再試行してください。",
    );
  }
}

async function handleApprovalAction(
  bot: Chat<Record<string, Adapter>>,
  event: ActionEvent,
): Promise<void> {
  const platform = asPlatform(event.adapter.name);
  if (!platform) return;

  const authorization = authorizeChatCapture({
    platform,
    platformUserId: event.user.userId,
    raw: event.raw,
  });
  if (!authorization.authorized) {
    await replyUnauthorizedAction(bot, event);
    return;
  }

  if (event.actionId === actionModelXai || event.actionId === actionModelSakana) {
    await handleModelChangeAction(bot, event, authorization.ownerLogin);
    return;
  }

  const requestId = event.value?.trim() ?? "";
  if (!/^chat_[0-9a-f-]{36}$/i.test(requestId)) {
    await replyActionError(bot, event, "承認対象を特定できませんでした。候補を作り直してください。");
    return;
  }

  try {
    if (event.actionId === actionReject) {
      const result = await rejectChatCardDraft({
        requestId,
        ownerLogin: authorization.ownerLogin,
        platform,
        platformUserId: authorization.platformUserId,
      });
      if (result.outcome === "not_found") {
        await replyActionError(bot, event, "この候補は見つからないか、別のユーザーの候補です。");
        return;
      }
      if (result.outcome === "unavailable") {
        await replyActionError(bot, event, "この候補は現在破棄できません。");
        return;
      }
      await event.adapter.editMessage(
        event.threadId,
        event.messageId,
        resolvedCard("候補を破棄しました", "この候補はLISTSへ登録されません。"),
      );
      return;
    }

    const result = await approveChatCardDraft({
      requestId,
      ownerLogin: authorization.ownerLogin,
      platform,
      platformUserId: authorization.platformUserId,
    });
    if (result.outcome === "not_found") {
      await replyActionError(bot, event, "この候補は見つからないか、別のユーザーの候補です。");
      return;
    }
    if (result.outcome === "busy") {
      await replyActionError(bot, event, "登録処理中です。少し待ってからLISTSを確認してください。");
      return;
    }
    if (result.outcome === "unavailable") {
      await replyActionError(bot, event, "この候補は登録できない状態です。新しく候補を作成してください。");
      return;
    }

    if (!result.entry) {
      await replyActionError(bot, event, "登録結果を読み込めませんでした。LISTSを確認してください。");
      return;
    }
    await event.adapter.editMessage(
      event.threadId,
      event.messageId,
      resolvedCard(
        result.outcome === "already_approved" ? "登録済みです" : "SayDeckへ登録しました",
        `${result.entry.primarySituation?.labelJa ?? "主シチュエーション"} › ${result.entry.secondarySituation?.labelJa ?? "副シチュエーション"}`,
        true,
      ),
    );
  } catch (error) {
    logServerError("Failed to resolve a SayDeck chat draft.", error, {
      platform,
      requestId,
      actionId: event.actionId,
    });
    await replyActionError(
      bot,
      event,
      "登録処理に失敗しました。候補は未登録のままなので、設定を確認してもう一度押してください。",
    );
  }
}

async function handleModelChangeAction(
  bot: Chat<Record<string, Adapter>>,
  event: ActionEvent,
  ownerLogin: string,
): Promise<void> {
  const provider = event.actionId === actionModelSakana ? "sakana" : "xai";
  if (!isAiProviderCode(provider)) return;

  try {
    const settings = await setActiveAiProvider(ownerLogin, provider);
    await event.adapter.editMessage(
      event.threadId,
      event.messageId,
      modelStatusCard(settings, "切り替えました。次回の生成から使用します。"),
    );
  } catch (error) {
    if (error instanceof AiProviderNotConfiguredError) {
      await replyActionError(bot, event, "このproviderのAPI keyがProductionに設定されていません。");
      return;
    }
    logServerError("Failed to change AI provider from Slack.", error, { provider });
    await replyActionError(bot, event, "AI providerを変更できませんでした。migrationと設定を確認してください。");
  }
}

function cardForRequest(request: ChatCardRequest, entry: ExpressionEntryDetail | null) {
  if (request.status === "approved") {
    return resolvedCard("登録済みです", "SayDeckのLISTSで確認できます。", true);
  }
  if (request.status === "rejected") {
    return resolvedCard("候補を破棄しました", "この候補はLISTSへ登録されません。");
  }
  if (request.status === "failed") {
    return resolvedCard("生成に失敗しました", "設定を確認し、新しいメッセージで再試行してください。");
  }
  if (!entry || request.status !== "awaiting_approval") {
    return resolvedCard("処理中です", "同じ入力の生成処理が進行中です。しばらくお待ちください。");
  }

  return Card({
    title: "SayDeck 登録前プレビュー",
    children: [
      CardText(buildPreviewText(request, entry)),
      Actions([
        Button({
          id: actionRegister,
          label: "登録",
          style: "primary",
          value: request.id,
        }),
        Button({
          id: actionReject,
          label: "破棄",
          style: "danger",
          value: request.id,
        }),
      ]),
    ],
  });
}

function resolvedCard(title: string, message: string, includeListsLink = false) {
  return Card({
    title,
    children: [
      CardText(message),
      ...(includeListsLink
        ? [Actions([LinkButton({ label: "LISTSを開く", url: `${applicationUrl()}/lists` })])]
        : []),
    ],
  });
}

function modelStatusCard(
  settings: Awaited<ReturnType<typeof getAiProviderSettings>>,
  notice?: string,
) {
  const active = settings.providers.find((provider) => provider.provider === settings.activeProvider);
  const lines = [
    ...(notice ? [notice, ""] : []),
    `現在: ${active?.label ?? settings.activeProvider}`,
    `Model: ${active?.model ?? "未設定"}`,
    "",
    ...settings.providers.map((provider) => (
      `${provider.provider === settings.activeProvider ? "●" : "○"} ${provider.label} / ${provider.model} / API key ${provider.configured ? "設定済み" : "未設定"}`
    )),
    "",
    "変更する場合: /saydeck modelchange",
  ];
  return Card({ title: "SayDeck AI model", children: [CardText(lines.join("\n"))] });
}

function modelChangeCard(settings: Awaited<ReturnType<typeof getAiProviderSettings>>) {
  return Card({
    title: "AI providerを選択",
    children: [
      CardText("API key本体は表示しません。変更は次回のカード生成から適用されます。"),
      Actions(settings.providers.map((provider) => Button({
        id: provider.provider === "sakana" ? actionModelSakana : actionModelXai,
        label: `${provider.provider === settings.activeProvider ? "使用中: " : ""}${provider.label}`,
        value: provider.provider,
        style: provider.provider === settings.activeProvider ? "primary" : undefined,
      }))),
    ],
  });
}

function buildPreviewText(request: ChatCardRequest, entry: ExpressionEntryDetail): string {
  const lines = [
    `主: ${request.primarySituationLabelJa}`,
    `副: ${request.secondarySituationLabelJa}`,
    `入力: ${truncate(entry.inputJa, 300)}`,
    "",
  ];
  let omitted = 0;

  for (const card of entry.sentenceCards) {
    const segmentLines = [
      `${String(card.position + 1).padStart(3, "0")} ${card.intentJa}`,
      ...(card.variants ?? []).map(formatVariant),
      "",
    ];
    if ([...lines, ...segmentLines].join("\n").length > 2_700) {
      omitted += 1;
      continue;
    }
    lines.push(...segmentLines);
  }

  if (omitted > 0) lines.push(`ほか ${omitted} 件の意味単位は登録後にLISTSで確認できます。`);
  lines.push("「登録」で表示された全候補を保存します。");
  return lines.join("\n");
}

function formatVariant(variant: SentenceVariant): string {
  const label = variant.profileCode === "standard"
    ? "01_標準表現"
    : variant.profileCode === "native"
      ? "02_ネイティブ表現"
      : `03${variant.patternCode === "default" ? "" : variant.patternCode}_表現パターン`;
  return `${label}: ${variant.expressionEn}\n訳: ${variant.translationJa}`;
}

async function replyUnauthorized(thread: Thread, user: Author): Promise<void> {
  if (thread.isDM) {
    await thread.post("このBotは設定済みのSayDeck ownerだけが利用できます。");
    return;
  }
  await thread.postEphemeral(
    user,
    "この操作はSayDeck ownerだけが利用できます。",
    { fallbackToDM: true },
  );
}

async function replyUnauthorizedAction(
  bot: Chat<Record<string, Adapter>>,
  event: ActionEvent,
): Promise<void> {
  await replyActionError(bot, event, "この操作はSayDeck ownerだけが利用できます。");
}

async function replyActionError(
  bot: Chat<Record<string, Adapter>>,
  event: ActionEvent,
  message: string,
): Promise<void> {
  if (event.thread) {
    await event.thread.postEphemeral(event.user, message, { fallbackToDM: true });
    return;
  }
  const dm = await bot.openDM(event.user);
  await dm.post(message);
}

function cleanInput(value: string): string {
  return value
    .replace(/<@[^>]+>/g, " ")
    .replace(/(^|\s)@saydeck\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidInput(value: string): boolean {
  return value.length > 0 && value.length <= maxInputLength;
}

function inputErrorMessage(value: string): string {
  return value.length > maxInputLength
    ? "言いたいことは2,000文字以内にしてください。"
    : "`/saydeck 言いたいこと`、DM、またはメンションに続けて日本語を入力してください。";
}

function asPlatform(value: string): ChatCapturePlatform | null {
  return value === "slack" || value === "discord" ? value : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function applicationUrl(): string {
  const configured = process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    || process.env.VERCEL_URL?.trim();
  return vercelUrl ? `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : productionUrl;
}

function findNestedString(
  value: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const candidate of Object.values(record)) {
    const nested = findNestedString(candidate, keys, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}
