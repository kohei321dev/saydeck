import { getOwnerAiConfig, getOwnerAiModelLabel, isOwnerAiConfigured } from "@/lib/ai-config";
import { isAuthConfigured, isGitHubAuthConfigured, ownerGithubUsername } from "@/lib/auth";
import { isBlobStorageConfigured, isLocalBinaryStorageAllowed } from "@/lib/binary-store";
import { getSql, isDatabaseConfigured } from "@/lib/db";
import { logServerError } from "@/lib/log-redaction";
import { isTtsConfigured } from "@/lib/tts-provider";

export type RuntimeProbeStatus = "not_configured" | "not_probed" | "connected" | "failed";

export type RuntimeDiagnostics = {
  ai: { apiKeyConfigured: boolean; model: string; probeStatus: RuntimeProbeStatus; providerStatus: number | null };
  auth: { configured: boolean; githubConfigured: boolean; ownerGithubUsername: string };
  database: { configured: boolean; probeStatus: RuntimeProbeStatus; expressionSchemaReady: boolean };
  media: { ttsConfigured: boolean; blobConfigured: boolean; localDevelopmentStorageAllowed: boolean };
};

export async function getRuntimeDiagnostics(options: { probeExternal?: boolean } = {}): Promise<RuntimeDiagnostics> {
  const databaseProbe = await probeDatabase();
  const aiProbe = options.probeExternal
    ? await probeOwnerAi()
    : { status: isOwnerAiConfigured() ? "not_probed" as const : "not_configured" as const, providerStatus: null };

  return {
    ai: { apiKeyConfigured: isOwnerAiConfigured(), model: sanitize(getOwnerAiModelLabel()), probeStatus: aiProbe.status, providerStatus: aiProbe.providerStatus },
    auth: { configured: isAuthConfigured(), githubConfigured: isGitHubAuthConfigured(), ownerGithubUsername: sanitize(ownerGithubUsername) },
    database: { configured: isDatabaseConfigured(), probeStatus: databaseProbe.status, expressionSchemaReady: databaseProbe.expressionSchemaReady },
    media: { ttsConfigured: isTtsConfigured(), blobConfigured: isBlobStorageConfigured(), localDevelopmentStorageAllowed: isLocalBinaryStorageAllowed() },
  };
}

function sanitize(value: string): string {
  return value.startsWith("op://") ? "(configured reference)" : value;
}

async function probeDatabase(): Promise<{ status: RuntimeProbeStatus; expressionSchemaReady: boolean }> {
  if (!isDatabaseConfigured()) return { status: "not_configured", expressionSchemaReady: false };
  try {
    const sql = getSql();
    const rows = await sql<{ ok: number; expression_entries: string | null; sentence_cards: string | null; sentence_variants: string | null; audio_assets: string | null; anki_exports: string | null }[]>`
      select 1 as ok,
        to_regclass('public.expression_entries') as expression_entries,
        to_regclass('public.sentence_cards') as sentence_cards,
        to_regclass('public.sentence_variants') as sentence_variants,
        to_regclass('public.audio_assets') as audio_assets,
        to_regclass('public.anki_exports') as anki_exports
    `;
    const row = rows[0];
    return { status: row?.ok === 1 ? "connected" : "failed", expressionSchemaReady: Boolean(row?.expression_entries && row.sentence_cards && row.sentence_variants && row.audio_assets && row.anki_exports) };
  } catch (error) {
    logServerError("Failed to probe runtime database connection.", error);
    return { status: "failed", expressionSchemaReady: false };
  }
}

async function probeOwnerAi(): Promise<{ status: RuntimeProbeStatus; providerStatus: number | null }> {
  if (!isOwnerAiConfigured()) return { status: "not_configured", providerStatus: null };
  try {
    const config = getOwnerAiConfig();
    const response = await fetch("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(15_000) });
    return { status: response.ok ? "connected" : "failed", providerStatus: response.status };
  } catch (error) {
    logServerError("Failed to probe owner AI provider.", error);
    return { status: "failed", providerStatus: null };
  }
}
