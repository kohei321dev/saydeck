import { getSql, isDatabaseConfigured } from "@/lib/db";
import { ExpressionDatabaseUnavailableError } from "@/lib/expression-store";
import type { ChatCapturePlatform } from "@/lib/chat-capture-auth";

export type ChatCardRequestStatus =
  | "generating"
  | "awaiting_approval"
  | "approving"
  | "approved"
  | "rejected"
  | "failed";

export type ChatCardRequest = {
  id: string;
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
  platformWorkspaceId: string;
  platformChannelId: string;
  platformThreadId: string;
  sourceEventId: string;
  entryId: string;
  status: ChatCardRequestStatus;
  primarySituationId: string | null;
  primarySituationLabelJa: string;
  secondarySituationLabelJa: string;
  selectedVariantIds: string[];
  errorCode: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatCardRequestRow = {
  id: string;
  owner_login: string;
  platform: ChatCapturePlatform;
  platform_user_id: string;
  platform_workspace_id: string;
  platform_channel_id: string;
  platform_thread_id: string;
  source_event_id: string;
  entry_id: string;
  status: ChatCardRequestStatus;
  primary_situation_id: string | null;
  primary_situation_label_ja: string;
  secondary_situation_label_ja: string;
  selected_variant_ids: string[] | null;
  error_code: string | null;
  approved_at: Date | string | null;
  rejected_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function requireDatabase() {
  if (!isDatabaseConfigured()) {
    throw new ExpressionDatabaseUnavailableError();
  }

  return getSql();
}

export async function getChatCardRequestBySource(input: {
  platform: ChatCapturePlatform;
  sourceEventId: string;
}): Promise<ChatCardRequest | null> {
  const sql = requireDatabase();
  const rows = await sql<ChatCardRequestRow[]>`
    select id, owner_login, platform, platform_user_id, platform_workspace_id,
      platform_channel_id, platform_thread_id, source_event_id, entry_id,
      status, primary_situation_id, primary_situation_label_ja,
      secondary_situation_label_ja, selected_variant_ids, error_code,
      approved_at, rejected_at, created_at, updated_at
    from chat_card_requests
    where platform = ${input.platform}
      and source_event_id = ${input.sourceEventId}
    limit 1
  `;
  return rows[0] ? toChatCardRequest(rows[0]) : null;
}

export async function getChatCardRequest(input: {
  requestId: string;
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
}): Promise<ChatCardRequest | null> {
  const sql = requireDatabase();
  const rows = await sql<ChatCardRequestRow[]>`
    select id, owner_login, platform, platform_user_id, platform_workspace_id,
      platform_channel_id, platform_thread_id, source_event_id, entry_id,
      status, primary_situation_id, primary_situation_label_ja,
      secondary_situation_label_ja, selected_variant_ids, error_code,
      approved_at, rejected_at, created_at, updated_at
    from chat_card_requests
    where id = ${input.requestId}
      and owner_login = ${input.ownerLogin}
      and platform = ${input.platform}
      and platform_user_id = ${input.platformUserId}
    limit 1
  `;
  return rows[0] ? toChatCardRequest(rows[0]) : null;
}

export async function createChatCardRequest(input: {
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
  platformWorkspaceId: string;
  platformChannelId: string;
  platformThreadId: string;
  sourceEventId: string;
  entryId: string;
}): Promise<{ created: boolean; request: ChatCardRequest }> {
  const sql = requireDatabase();
  const requestId = `chat_${crypto.randomUUID()}`;
  const rows = await sql<ChatCardRequestRow[]>`
    insert into chat_card_requests (
      id, owner_login, platform, platform_user_id, platform_workspace_id,
      platform_channel_id, platform_thread_id, source_event_id, entry_id,
      status
    ) values (
      ${requestId}, ${input.ownerLogin}, ${input.platform},
      ${input.platformUserId}, ${input.platformWorkspaceId},
      ${input.platformChannelId}, ${input.platformThreadId},
      ${input.sourceEventId}, ${input.entryId}, 'generating'
    )
    on conflict (platform, source_event_id) do nothing
    returning id, owner_login, platform, platform_user_id, platform_workspace_id,
      platform_channel_id, platform_thread_id, source_event_id, entry_id,
      status, primary_situation_id, primary_situation_label_ja,
      secondary_situation_label_ja, selected_variant_ids, error_code,
      approved_at, rejected_at, created_at, updated_at
  `;

  if (rows[0]) {
    return { created: true, request: toChatCardRequest(rows[0]) };
  }

  const existing = await getChatCardRequestBySource({
    platform: input.platform,
    sourceEventId: input.sourceEventId,
  });
  if (!existing) {
    throw new Error("Chat card request conflict could not be resolved.");
  }
  return { created: false, request: existing };
}

export async function markChatCardRequestGenerated(input: {
  requestId: string;
  primarySituationId: string | null;
  primarySituationLabelJa: string;
  secondarySituationLabelJa: string;
  selectedVariantIds: string[];
}): Promise<ChatCardRequest> {
  const sql = requireDatabase();
  const rows = await sql<ChatCardRequestRow[]>`
    update chat_card_requests
    set status = 'awaiting_approval',
      primary_situation_id = ${input.primarySituationId},
      primary_situation_label_ja = ${input.primarySituationLabelJa},
      secondary_situation_label_ja = ${input.secondarySituationLabelJa},
      selected_variant_ids = ${sql.array(input.selectedVariantIds)},
      error_code = null,
      updated_at = now()
    where id = ${input.requestId}
      and status = 'generating'
    returning id, owner_login, platform, platform_user_id, platform_workspace_id,
      platform_channel_id, platform_thread_id, source_event_id, entry_id,
      status, primary_situation_id, primary_situation_label_ja,
      secondary_situation_label_ja, selected_variant_ids, error_code,
      approved_at, rejected_at, created_at, updated_at
  `;
  if (!rows[0]) throw new Error("Chat card request was not generating.");
  return toChatCardRequest(rows[0]);
}

export async function markChatCardRequestFailed(input: {
  requestId: string;
  errorCode: string;
}): Promise<void> {
  const sql = requireDatabase();
  await sql`
    update chat_card_requests
    set status = 'failed', error_code = ${input.errorCode}, updated_at = now()
    where id = ${input.requestId}
      and status not in ('approved', 'rejected')
  `;
}

export async function claimChatCardRequestForApproval(input: {
  requestId: string;
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
}): Promise<ChatCardRequest | null> {
  const sql = requireDatabase();
  const rows = await sql<ChatCardRequestRow[]>`
    update chat_card_requests
    set status = 'approving', error_code = null, updated_at = now()
    where id = ${input.requestId}
      and owner_login = ${input.ownerLogin}
      and platform = ${input.platform}
      and platform_user_id = ${input.platformUserId}
      and (
        status = 'awaiting_approval'
        or (status = 'approving' and updated_at < now() - interval '10 minutes')
      )
    returning id, owner_login, platform, platform_user_id, platform_workspace_id,
      platform_channel_id, platform_thread_id, source_event_id, entry_id,
      status, primary_situation_id, primary_situation_label_ja,
      secondary_situation_label_ja, selected_variant_ids, error_code,
      approved_at, rejected_at, created_at, updated_at
  `;
  return rows[0] ? toChatCardRequest(rows[0]) : null;
}

export async function completeChatCardRequestApproval(requestId: string): Promise<void> {
  const sql = requireDatabase();
  await sql`
    update chat_card_requests
    set status = 'approved', approved_at = coalesce(approved_at, now()),
      error_code = null, updated_at = now()
    where id = ${requestId}
      and status in ('approving', 'approved')
  `;
}

export async function restoreChatCardRequestAfterApprovalFailure(input: {
  requestId: string;
  errorCode: string;
}): Promise<void> {
  const sql = requireDatabase();
  await sql`
    update chat_card_requests
    set status = 'awaiting_approval', error_code = ${input.errorCode}, updated_at = now()
    where id = ${input.requestId}
      and status = 'approving'
  `;
}

export async function rejectChatCardRequest(input: {
  requestId: string;
  ownerLogin: string;
  platform: ChatCapturePlatform;
  platformUserId: string;
}): Promise<ChatCardRequest | null> {
  const sql = requireDatabase();
  const rows = await sql<ChatCardRequestRow[]>`
    update chat_card_requests
    set status = 'rejected', rejected_at = coalesce(rejected_at, now()),
      error_code = null, updated_at = now()
    where id = ${input.requestId}
      and owner_login = ${input.ownerLogin}
      and platform = ${input.platform}
      and platform_user_id = ${input.platformUserId}
      and status in ('awaiting_approval', 'rejected')
    returning id, owner_login, platform, platform_user_id, platform_workspace_id,
      platform_channel_id, platform_thread_id, source_event_id, entry_id,
      status, primary_situation_id, primary_situation_label_ja,
      secondary_situation_label_ja, selected_variant_ids, error_code,
      approved_at, rejected_at, created_at, updated_at
  `;
  return rows[0] ? toChatCardRequest(rows[0]) : null;
}

function toChatCardRequest(row: ChatCardRequestRow): ChatCardRequest {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    platform: row.platform,
    platformUserId: row.platform_user_id,
    platformWorkspaceId: row.platform_workspace_id,
    platformChannelId: row.platform_channel_id,
    platformThreadId: row.platform_thread_id,
    sourceEventId: row.source_event_id,
    entryId: row.entry_id,
    status: row.status,
    primarySituationId: row.primary_situation_id,
    primarySituationLabelJa: row.primary_situation_label_ja,
    secondarySituationLabelJa: row.secondary_situation_label_ja,
    selectedVariantIds: row.selected_variant_ids ?? [],
    errorCode: row.error_code,
    approvedAt: row.approved_at ? toIso(row.approved_at) : null,
    rejectedAt: row.rejected_at ? toIso(row.rejected_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
