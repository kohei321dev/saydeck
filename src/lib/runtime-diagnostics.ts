import { getAiProviderDescriptor } from "@/lib/ai-config";
import type { AiProviderCode } from "@/lib/ai-config";
import { getAiProviderSettings, probeAiProvider } from "@/lib/ai-provider-settings";
import { isAuthConfigured, isGitHubAuthConfigured, ownerGithubUsername } from "@/lib/auth";
import { isBlobStorageConfigured, isLocalBinaryStorageAllowed } from "@/lib/binary-store";
import { isDiscordChatCaptureConfigured, isSlackChatCaptureConfigured } from "@/lib/chat-capture-auth";
import { getSql, isDatabaseConfigured } from "@/lib/db";
import { logServerError } from "@/lib/log-redaction";
import { isTtsConfigured } from "@/lib/tts-provider";

export type RuntimeProbeStatus = "not_configured" | "not_probed" | "connected" | "failed";

export type RuntimeDiagnostics = {
  ai: { provider: AiProviderCode; apiKeyConfigured: boolean; model: string; probeStatus: RuntimeProbeStatus; providerStatus: number | null };
  auth: { configured: boolean; githubConfigured: boolean; ownerGithubUsername: string };
  chatCapture: { slackConfigured: boolean; discordConfigured: boolean; schemaReady: boolean };
  database: { configured: boolean; probeStatus: RuntimeProbeStatus; expressionSchemaReady: boolean };
  media: { ttsConfigured: boolean; blobConfigured: boolean; localDevelopmentStorageAllowed: boolean };
};

export async function getRuntimeDiagnostics(options: { probeExternal?: boolean } = {}): Promise<RuntimeDiagnostics> {
  const databaseProbe = await probeDatabase();
  const aiSettings = await getAiProviderSettings(ownerGithubUsername).catch(() => ({
    activeProvider: "xai" as const,
    providers: [getAiProviderDescriptor("xai"), getAiProviderDescriptor("sakana")],
  }));
  const activeAi = aiSettings.providers.find(
    (provider) => provider.provider === aiSettings.activeProvider,
  ) ?? getAiProviderDescriptor(aiSettings.activeProvider);
  const aiProbe = options.probeExternal
    ? await probeSelectedAi(aiSettings.activeProvider)
    : {
        status: activeAi.configured ? "not_probed" as const : "not_configured" as const,
        providerStatus: null,
      };

  return {
    ai: {
      provider: aiSettings.activeProvider,
      apiKeyConfigured: activeAi.configured,
      model: sanitize(activeAi.model),
      probeStatus: aiProbe.status,
      providerStatus: aiProbe.providerStatus,
    },
    auth: {
      configured: isAuthConfigured(),
      githubConfigured: isGitHubAuthConfigured(),
      ownerGithubUsername: sanitize(ownerGithubUsername),
    },
    chatCapture: {
      slackConfigured: isSlackChatCaptureConfigured(),
      discordConfigured: isDiscordChatCaptureConfigured(),
      schemaReady: databaseProbe.chatCaptureSchemaReady,
    },
    database: {
      configured: isDatabaseConfigured(),
      probeStatus: databaseProbe.status,
      expressionSchemaReady: databaseProbe.expressionSchemaReady,
    },
    media: {
      ttsConfigured: isTtsConfigured(),
      blobConfigured: isBlobStorageConfigured(),
      localDevelopmentStorageAllowed: isLocalBinaryStorageAllowed(),
    },
  };
}

function sanitize(value: string): string {
  return value.startsWith("op://") ? "(configured reference)" : value;
}

async function probeDatabase(): Promise<{ status: RuntimeProbeStatus; expressionSchemaReady: boolean; chatCaptureSchemaReady: boolean }> {
  if (!isDatabaseConfigured()) {
    return { status: "not_configured", expressionSchemaReady: false, chatCaptureSchemaReady: false };
  }

  try {
    const sql = getSql();
    const rows = await sql<{
      ok: number;
      expression_entries: string | null;
      sentence_cards: string | null;
      sentence_variants: string | null;
      audio_assets: string | null;
      anki_exports: string | null;
      situation_definitions: string | null;
      expression_entry_situations: string | null;
      situation_sequence_counters: string | null;
      chat_card_requests: string | null;
      owner_ai_settings: string | null;
      has_situation_sequence: boolean;
      has_expression_en: boolean;
      has_pattern_code: boolean;
      has_three_layer_codes: boolean;
      has_generation_provider: boolean;
      has_generation_model: boolean;
    }[]>`
      select 1 as ok,
        to_regclass('public.expression_entries') as expression_entries,
        to_regclass('public.sentence_cards') as sentence_cards,
        to_regclass('public.sentence_variants') as sentence_variants,
        to_regclass('public.audio_assets') as audio_assets,
        to_regclass('public.anki_exports') as anki_exports,
        to_regclass('public.situation_definitions') as situation_definitions,
        to_regclass('public.expression_entry_situations') as expression_entry_situations,
        to_regclass('public.situation_sequence_counters') as situation_sequence_counters,
        to_regclass('public.chat_card_requests') as chat_card_requests,
        to_regclass('public.owner_ai_settings') as owner_ai_settings,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'expression_entries'
            and column_name = 'situation_sequence'
        ) as has_situation_sequence,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'sentence_variants'
            and column_name = 'expression_en'
        ) as has_expression_en,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'sentence_variants'
            and column_name = 'pattern_code'
        ) as has_pattern_code,
        exists (
          select 1
          from pg_constraint
          where conname = 'generation_profiles_code_check'
            and conrelid = 'public.generation_profiles'::regclass
            and pg_get_constraintdef(oid) like '%standard%'
            and pg_get_constraintdef(oid) like '%native%'
            and pg_get_constraintdef(oid) like '%pattern%'
        ) as has_three_layer_codes,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'sentence_cards'
            and column_name = 'generation_provider'
        ) as has_generation_provider,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'sentence_cards'
            and column_name = 'generation_model'
        ) as has_generation_model
    `;
    const row = rows[0];
    return {
      status: row?.ok === 1 ? "connected" : "failed",
      expressionSchemaReady: Boolean(
        row?.expression_entries
        && row.sentence_cards
        && row.sentence_variants
        && row.audio_assets
        && row.anki_exports
        && row.situation_definitions
        && row.expression_entry_situations
        && row.situation_sequence_counters
        && row.owner_ai_settings
        && row.has_situation_sequence
        && row.has_expression_en
        && row.has_pattern_code
        && row.has_three_layer_codes
        && row.has_generation_provider
        && row.has_generation_model
      ),
      chatCaptureSchemaReady: Boolean(row?.chat_card_requests),
    };
  } catch (error) {
    logServerError("Failed to probe runtime database connection.", error);
    return { status: "failed", expressionSchemaReady: false, chatCaptureSchemaReady: false };
  }
}

async function probeSelectedAi(provider: AiProviderCode): Promise<{ status: RuntimeProbeStatus; providerStatus: number | null }> {
  const probe = await probeAiProvider(provider);
  if (!probe.configured) return { status: "not_configured", providerStatus: null };
  return { status: probe.connected ? "connected" : "failed", providerStatus: probe.status };
}
