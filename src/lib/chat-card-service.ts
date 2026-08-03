import { AiModelNotAllowedError, MissingAiApiKeyError } from "@/lib/ai-config";
import { resolveGenerationAiConfig } from "@/lib/ai-provider-settings";
import type { ChatCapturePlatform } from "@/lib/chat-capture-auth";
import {
  claimChatCardRequestForApproval,
  completeChatCardRequestApproval,
  createChatCardRequest,
  getChatCardRequest,
  getChatCardRequestBySource,
  markChatCardRequestFailed,
  markChatCardRequestGenerated,
  rejectChatCardRequest,
  restoreChatCardRequestAfterApprovalFailure,
} from "@/lib/chat-card-store";
import type { ChatCardRequest } from "@/lib/chat-card-store";
import {
  ExpressionGenerationError,
  generateExpressionWithAi,
} from "@/lib/expression-generation";
import {
  approveExpressionEntry,
  archiveExpressionEntry,
  createExpressionEntry,
  getExpressionEntry,
  listGenerationProfiles,
  listPrimarySituationDefinitions,
  saveGenerationResult,
} from "@/lib/expression-store";
import type { ExpressionEntryDetail } from "@/lib/expression-types";

export type CreateChatCardDraftResult = {
  request: ChatCardRequest;
  entry: ExpressionEntryDetail | null;
  duplicate: boolean;
};

export type ApproveChatCardDraftResult =
  | { outcome: "approved" | "already_approved"; request: ChatCardRequest; entry: ExpressionEntryDetail }
  | { outcome: "busy" | "not_found" | "unavailable"; request: ChatCardRequest | null; entry: null };

export type RejectChatCardDraftResult =
  | { outcome: "rejected" | "already_rejected"; request: ChatCardRequest }
  | { outcome: "not_found" | "unavailable"; request: ChatCardRequest | null };

export async function createChatCardDraft(input: {
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
  platformWorkspaceId: string;
  platformChannelId: string;
  platformThreadId: string;
  sourceEventId: string;
  inputJa: string;
}): Promise<CreateChatCardDraftResult> {
  const existing = await getChatCardRequestBySource({
    platform: input.platform,
    sourceEventId: input.sourceEventId,
  });
  if (existing) {
    return {
      request: existing,
      entry: await getExpressionEntry(existing.ownerLogin, existing.entryId),
      duplicate: true,
    };
  }

  const entry = await createExpressionEntry({
    ownerLogin: input.ownerLogin,
    inputJa: input.inputJa,
  });
  let created;
  try {
    created = await createChatCardRequest({
      ownerLogin: input.ownerLogin,
      platform: input.platform,
      platformUserId: input.platformUserId,
      platformWorkspaceId: input.platformWorkspaceId,
      platformChannelId: input.platformChannelId,
      platformThreadId: input.platformThreadId,
      sourceEventId: input.sourceEventId,
      entryId: entry.id,
    });
  } catch (error) {
    await archiveExpressionEntry({
      ownerLogin: input.ownerLogin,
      entryId: entry.id,
    }).catch(() => undefined);
    throw error;
  }

  if (!created.created) {
    await archiveExpressionEntry({ ownerLogin: input.ownerLogin, entryId: entry.id });
    return {
      request: created.request,
      entry: await getExpressionEntry(created.request.ownerLogin, created.request.entryId),
      duplicate: true,
    };
  }

  try {
    const [profiles, primarySituations, aiConfig] = await Promise.all([
      listGenerationProfiles(input.ownerLogin),
      listPrimarySituationDefinitions(input.ownerLogin),
      resolveGenerationAiConfig(input.ownerLogin),
    ]);
    const generation = await generateExpressionWithAi({
      inputJa: entry.inputJa,
      existingPrimarySituations: primarySituations,
      profiles,
    }, aiConfig);
    const saved = await saveGenerationResult({
      ownerLogin: input.ownerLogin,
      entryId: entry.id,
      result: generation.result,
      generationProvider: generation.provider,
      generationModel: generation.model,
    });
    const selectedVariantIds = saved.sentenceCards.flatMap(
      (card) => (card.variants ?? []).map((variant) => variant.id),
    ).slice(0, 100);
    const request = await markChatCardRequestGenerated({
      requestId: created.request.id,
      primarySituationId: generation.result.situationSuggestion.primarySituationId,
      primarySituationLabelJa: generation.result.situationSuggestion.primaryLabelJa,
      secondarySituationLabelJa: generation.result.situationSuggestion.secondaryBaseLabelJa,
      selectedVariantIds,
    });

    return { request, entry: saved, duplicate: false };
  } catch (error) {
    await markChatCardRequestFailed({
      requestId: created.request.id,
      errorCode: toChatCardErrorCode(error),
    }).catch(() => undefined);
    await archiveExpressionEntry({
      ownerLogin: input.ownerLogin,
      entryId: entry.id,
    }).catch(() => undefined);
    throw error;
  }
}

export async function approveChatCardDraft(input: {
  requestId: string;
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
}): Promise<ApproveChatCardDraftResult> {
  const current = await getChatCardRequest(input);
  if (!current) return { outcome: "not_found", request: null, entry: null };

  if (current.status === "approved") {
    const entry = await getExpressionEntry(current.ownerLogin, current.entryId);
    return entry
      ? { outcome: "already_approved", request: current, entry }
      : { outcome: "unavailable", request: current, entry: null };
  }
  if (current.status === "approving") {
    return { outcome: "busy", request: current, entry: null };
  }
  if (current.status !== "awaiting_approval") {
    return { outcome: "unavailable", request: current, entry: null };
  }

  const claimed = await claimChatCardRequestForApproval(input);
  if (!claimed) return { outcome: "busy", request: current, entry: null };

  try {
    const entry = await approveExpressionEntry({
      ownerLogin: claimed.ownerLogin,
      entryId: claimed.entryId,
      selectedVariantIds: claimed.selectedVariantIds,
      classification: {
        primarySituationId: claimed.primarySituationId ?? undefined,
        primarySituationLabelJa: claimed.primarySituationLabelJa,
        secondarySituationLabelJa: claimed.secondarySituationLabelJa,
        selectedBy: "user",
      },
    });
    await completeChatCardRequestApproval(claimed.id);
    const request = await getChatCardRequest(input);
    return { outcome: "approved", request: request ?? claimed, entry };
  } catch (error) {
    await restoreChatCardRequestAfterApprovalFailure({
      requestId: claimed.id,
      errorCode: toChatCardErrorCode(error),
    }).catch(() => undefined);
    throw error;
  }
}

export async function rejectChatCardDraft(input: {
  requestId: string;
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
}): Promise<RejectChatCardDraftResult> {
  const current = await getChatCardRequest(input);
  if (!current) return { outcome: "not_found", request: null };
  if (current.status === "rejected") {
    return { outcome: "already_rejected", request: current };
  }
  if (current.status !== "awaiting_approval") {
    return { outcome: "unavailable", request: current };
  }

  const rejected = await rejectChatCardRequest(input);
  if (!rejected) return { outcome: "unavailable", request: current };
  await archiveExpressionEntry({
    ownerLogin: rejected.ownerLogin,
    entryId: rejected.entryId,
  });
  return { outcome: "rejected", request: rejected };
}

function toChatCardErrorCode(error: unknown): string {
  if (error instanceof MissingAiApiKeyError || error instanceof AiModelNotAllowedError) {
    return "ai_not_configured";
  }
  if (error instanceof ExpressionGenerationError) return error.code;
  return "chat_card_operation_failed";
}
