import { NextResponse } from "next/server";

import { readPrivateBinaryStream } from "@/lib/binary-store";
import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import { getAnkiExportArtifact, AnkiExportUnavailableError } from "@/lib/anki-export";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerLogin = await getExpressionOwnerLogin();
  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Anki packageのdownloadにはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  try {
    const exportId = decodeURIComponent((await context.params).id).trim();
    const artifact = await getAnkiExportArtifact(ownerLogin, exportId);
    if (!artifact || artifact.status !== "ready") {
      return NextResponse.json(
        { error: { code: "not_found", message: "Anki packageが見つかりません。" } },
        { status: 404 },
      );
    }

    const stored = await readPrivateBinaryStream(artifact.blobPath);
    return new NextResponse(stored.stream, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.anki",
        "Content-Disposition": `attachment; filename="saydeck-anki-${exportId}.apkg"`,
        "Cache-Control": "private, no-store",
        "X-SayDeck-Card-Count": String(artifact.cardCount),
      },
    });
  } catch (error) {
    if (error instanceof AnkiExportUnavailableError) {
      return NextResponse.json(
        { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
        { status: 503 },
      );
    }
    logServerError("Failed to download Anki package.", error);
    return NextResponse.json(
      { error: { code: "download_failed", message: "Anki packageを取得できません。" } },
      { status: 502 },
    );
  }
}
