import { NextResponse } from "next/server";

import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import {
  AudioRegistrationError,
  ExpressionDatabaseUnavailableError,
  registerSentenceVariantAudio,
  SentenceVariantNotFoundError,
} from "@/lib/expression-store";
import { MissingTtsApiKeyError, TtsProviderError } from "@/lib/tts-provider";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "音声登録にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  try {
    const variantId = decodeURIComponent((await context.params).id).trim();
    const result = await registerSentenceVariantAudio({ ownerLogin, variantId });
    return NextResponse.json({ entry: result.entry, mode: result.mode });
  } catch (error) {
    if (error instanceof SentenceVariantNotFoundError) {
      return NextResponse.json(
        { error: { code: "not_found", message: "音声対象のカードが見つかりません。" } },
        { status: 404 },
      );
    }

    if (error instanceof ExpressionDatabaseUnavailableError) {
      return NextResponse.json(
        { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
        { status: 503 },
      );
    }

    if (error instanceof MissingTtsApiKeyError) {
      return NextResponse.json(
        { error: { code: "tts_not_configured", message: "SAYDECK_TTS_API_KEYを設定してください。" } },
        { status: 503 },
      );
    }

    if (error instanceof AudioRegistrationError) {
      return NextResponse.json(
        { error: { code: error.code, message: "音声ファイルの登録に失敗しました。時間を置いて再試行してください。" } },
        { status: error.code === "provider_quota" ? 429 : 502 },
      );
    }

    if (error instanceof TtsProviderError) {
      return NextResponse.json(
        { error: { code: error.code, message: "音声生成に失敗しました。" } },
        { status: error.status },
      );
    }

    logServerError("Failed to register sentence variant audio.", error);
    return NextResponse.json(
      { error: { code: "audio_registration_failed", message: "音声登録に失敗しました。" } },
      { status: 502 },
    );
  }
}
