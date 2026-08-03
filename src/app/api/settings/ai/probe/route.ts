import { NextResponse } from "next/server";

import { isAiProviderCode } from "@/lib/ai-config";
import { probeAiProvider } from "@/lib/ai-provider-settings";
import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ownerLogin = await getExpressionOwnerLogin();
  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "接続確認にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isAiProviderCode(body?.provider)) {
    return NextResponse.json(
      { error: { code: "invalid_provider", message: "AI providerの指定が不正です。" } },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ probe: await probeAiProvider(body.provider) });
  } catch (error) {
    logServerError("Failed to probe AI provider from settings API.", error, {
      provider: body.provider,
    });
    return NextResponse.json(
      { error: { code: "probe_failed", message: "AI providerの接続確認に失敗しました。" } },
      { status: 502 },
    );
  }
}
