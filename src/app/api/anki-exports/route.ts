import { NextResponse } from "next/server";

import { BinaryStorageUnavailableError, putPrivateBinary } from "@/lib/binary-store";
import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import {
  AnkiPackageError,
  buildAnkiPackage,
} from "@/lib/anki-apkg";
import {
  AnkiAudioNotReadyError,
  AnkiExportUnavailableError,
  createAnkiExportArtifact,
  getAnkiExportRecords,
} from "@/lib/anki-export";
import { AudioRegistrationError, registerSentenceVariantAudio } from "@/lib/expression-store";
import { MissingTtsApiKeyError } from "@/lib/tts-provider";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Anki exportにはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const variantIds = readStringList(body.variantIds);
  const tags = readStringList(body.tags);
  const from = getString(body.from);
  const to = getString(body.to);

  try {
    const requestedRecords = await getAnkiExportRecords(ownerLogin, {
      variantIds,
      tags,
      from,
      to,
      requireAudio: false,
    });

    if (requestedRecords.length === 0) {
      return NextResponse.json(
        { error: { code: "no_cards", message: "EXPORTする保存済み表現がありません。" } },
        { status: 404 },
      );
    }

    await Promise.all(requestedRecords.map((record) => registerSentenceVariantAudio({
      ownerLogin,
      variantId: record.variantId,
    })));

    const records = await getAnkiExportRecords(ownerLogin, {
      variantIds,
      tags,
      from,
      to,
      requireAudio: true,
    });

    const bytes = await buildAnkiPackage(records);
    const exportId = `export_${crypto.randomUUID()}`;
    const storage = await putPrivateBinary(
      `exports/${safePathSegment(ownerLogin)}/${exportId}.apkg`,
      bytes,
      "application/vnd.anki",
    );
    await createAnkiExportArtifact({
      ownerLogin,
      id: exportId,
      status: "ready",
      cardCount: records.length,
      blobPath: storage.blobPath,
    });

    return NextResponse.json({
      export: {
        id: exportId,
        status: "ready",
        cardCount: records.length,
        filename: `saydeck-anki-${new Date().toISOString().slice(0, 10)}.apkg`,
      },
    });
  } catch (error) {
    if (error instanceof AnkiExportUnavailableError) {
      return NextResponse.json(
        { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
        { status: 503 },
      );
    }

    if (error instanceof AnkiAudioNotReadyError) {
      return NextResponse.json(
        { error: { code: "audio_not_ready", message: "WordとExample Sentenceの両方の音声が必要です。" } },
        { status: 409 },
      );
    }

    if (error instanceof MissingTtsApiKeyError) {
      return NextResponse.json(
        { error: { code: "tts_not_configured", message: "xAI音声の生成設定がありません。OWNER_AI_KEYを確認してください。" } },
        { status: 503 },
      );
    }

    if (error instanceof AudioRegistrationError) {
      return NextResponse.json(
        { error: { code: error.code, message: "米国英語音声の準備に失敗しました。時間を置いて再試行してください。" } },
        { status: error.code === "provider_quota" ? 429 : 502 },
      );
    }

    if (error instanceof AnkiPackageError) {
      return NextResponse.json(
        { error: { code: "package_failed", message: "Anki packageの生成に失敗しました。" } },
        { status: 502 },
      );
    }

    if (error instanceof BinaryStorageUnavailableError) {
      return NextResponse.json(
        { error: { code: "storage_not_configured", message: "private media storageを設定してください。" } },
        { status: 503 },
      );
    }

    logServerError("Failed to build Anki package.", error);
    return NextResponse.json(
      { error: { code: "export_failed", message: "Anki packageの生成に失敗しました。" } },
      { status: 502 },
    );
  }
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map(getString).filter(Boolean);
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "owner";
}
