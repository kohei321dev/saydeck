import { NextResponse } from "next/server";

import { readPrivateBinaryStream } from "@/lib/binary-store";
import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import {
  ExpressionDatabaseUnavailableError,
  getAudioAssetForOwner,
} from "@/lib/expression-store";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "音声再生にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  try {
    const assetId = decodeURIComponent((await context.params).id).trim();
    const asset = await getAudioAssetForOwner(ownerLogin, assetId);

    if (!asset || asset.status !== "ready" || asset.provider === "browser-speech" || !asset.blobPath) {
      return NextResponse.json(
        { error: { code: "not_found", message: "再生可能な音声が見つかりません。" } },
        { status: 404 },
      );
    }

    const audio = await readPrivateBinaryStream(asset.blobPath);
    return new NextResponse(audio.stream, {
      status: 200,
      headers: {
        "Content-Type": audio.contentType || "audio/wav",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="saydeck-${asset.kind}-${asset.variantId}.wav"`,
      },
    });
  } catch (error) {
    if (error instanceof ExpressionDatabaseUnavailableError) {
      return NextResponse.json(
        { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
        { status: 503 },
      );
    }

    logServerError("Failed to stream audio asset.", error);
    return NextResponse.json(
      { error: { code: "audio_unavailable", message: "音声を取得できません。" } },
      { status: 502 },
    );
  }
}
