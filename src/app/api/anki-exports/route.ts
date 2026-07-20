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
  AnkiSamplesUnavailableError,
  createAnkiExportArtifact,
  getAnkiExportRecords,
} from "@/lib/anki-export";
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

  if (body.includeSamples === true) {
    return NextResponse.json(
      { error: { code: "samples_unavailable", message: "音声同梱APKGでは初期サンプルを選択できません。" } },
      { status: 400 },
    );
  }

  try {
    const records = await getAnkiExportRecords(ownerLogin, {
      variantIds,
      tags,
      from,
      to,
      requireAudio: true,
    });

    if (records.length === 0) {
      return NextResponse.json(
        { error: { code: "no_cards", message: "音声readyの登録済みカードがありません。" } },
        { status: 404 },
      );
    }

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

    if (error instanceof AnkiSamplesUnavailableError) {
      return NextResponse.json(
        { error: { code: "samples_unavailable", message: "初期サンプルには同梱用音声がありません。" } },
        { status: 400 },
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
