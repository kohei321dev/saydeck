import { NextResponse } from "next/server";

import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import { AiModelNotAllowedError, MissingAiApiKeyError } from "@/lib/ai-config";
import {
  ExpressionGenerationError,
  generateExpressionWithAi,
} from "@/lib/expression-generation";
import {
  ExpressionDatabaseUnavailableError,
  ExpressionAlreadyRegisteredError,
  getExpressionEntry,
  listGenerationProfiles,
  saveGenerationResult,
} from "@/lib/expression-store";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "AI生成にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  const id = decodeURIComponent((await context.params).id).trim();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const segmentIntents = Array.isArray(body.segmentIntents)
    ? body.segmentIntents.filter((value): value is string => typeof value === "string")
      .map((value) => value.trim()).filter(Boolean).slice(0, 4)
    : undefined;

  try {
    const entry = await getExpressionEntry(ownerLogin, id);

    if (!entry) {
      return NextResponse.json(
        { error: { code: "not_found", message: "表現が見つかりません。" } },
        { status: 404 },
      );
    }

    const profiles = await listGenerationProfiles(ownerLogin);
    const result = await generateExpressionWithAi({
      inputJa: entry.inputJa,
      genreSlug: entry.genreSlug,
      legacySituationJa: entry.situationJa,
      existingSituationTags: entry.situationTags,
      segmentIntents,
      profiles,
    });
    const saved = await saveGenerationResult({
      ownerLogin,
      entryId: id,
      result,
    });

    return NextResponse.json({ entry: saved });
  } catch (error) {
    if (error instanceof ExpressionDatabaseUnavailableError) {
      return NextResponse.json(
        { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
        { status: 503 },
      );
    }

    if (error instanceof ExpressionAlreadyRegisteredError) {
      return NextResponse.json(
        { error: { code: "already_registered", message: "登録済みの表現は再生成できません。新しい入力として作成してください。" } },
        { status: 409 },
      );
    }

    if (error instanceof MissingAiApiKeyError || error instanceof AiModelNotAllowedError) {
      return NextResponse.json(
        { error: { code: "ai_not_configured", message: "OWNER_AI_KEYと許可済みOWNER_AI_MODELを設定してください。" } },
        { status: 503 },
      );
    }

    if (error instanceof ExpressionGenerationError) {
      logServerError("Failed to generate expression entry.", error, {
        generationCode: error.code,
        generationStatus: error.status,
      });
      return NextResponse.json(
        { error: { code: error.code, message: error.code === "external_ai_quota_exceeded" ? "AIのquotaまたはrate limitに達しました。時間を置いて再試行してください。" : "英文候補の生成に失敗しました。" } },
        { status: error.status },
      );
    }

    logServerError("Failed to generate expression entry.", error);
    return NextResponse.json(
      { error: { code: "generation_failed", message: "英文候補の生成に失敗しました。" } },
      { status: 502 },
    );
  }
}
