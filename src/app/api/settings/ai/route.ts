import { NextResponse } from "next/server";

import { AiModelNotAllowedError, isAiProviderCode } from "@/lib/ai-config";
import {
  AiProviderNotConfiguredError,
  getAiProviderSettings,
  setActiveAiProvider,
} from "@/lib/ai-provider-settings";
import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function GET() {
  const ownerLogin = await getExpressionOwnerLogin();
  if (!ownerLogin) return unauthorized();

  try {
    return NextResponse.json(await getAiProviderSettings(ownerLogin));
  } catch (error) {
    return settingsError("Failed to read AI provider settings.", error);
  }
}

export async function PATCH(request: Request) {
  const ownerLogin = await getExpressionOwnerLogin();
  if (!ownerLogin) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isAiProviderCode(body?.provider)) {
    return NextResponse.json(
      { error: { code: "invalid_provider", message: "AI providerの指定が不正です。" } },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await setActiveAiProvider(ownerLogin, body.provider));
  } catch (error) {
    if (error instanceof AiProviderNotConfiguredError) {
      return NextResponse.json(
        { error: { code: "provider_not_configured", message: "このAI providerのAPI keyが設定されていません。" } },
        { status: 409 },
      );
    }
    if (error instanceof AiModelNotAllowedError) {
      return NextResponse.json(
        { error: { code: "model_not_allowed", message: "このAI modelはSayDeckで許可されていません。" } },
        { status: 409 },
      );
    }
    return settingsError("Failed to update AI provider settings.", error);
  }
}

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "設定の確認にはownerログインが必要です。" } },
    { status: 401 },
  );
}

function settingsError(message: string, error: unknown) {
  logServerError(message, error);
  return NextResponse.json(
    { error: { code: "settings_unavailable", message: "AI provider設定を読み書きできませんでした。migrationとDATABASE_URLを確認してください。" } },
    { status: 502 },
  );
}
