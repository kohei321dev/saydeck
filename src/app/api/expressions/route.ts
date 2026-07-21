import { NextResponse } from "next/server";

import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import {
  createExpressionEntry,
  ExpressionDatabaseUnavailableError,
  listExpressionEntries,
} from "@/lib/expression-store";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function GET() {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "表現ライブラリにはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  try {
    const entries = await listExpressionEntries(ownerLogin);
    return NextResponse.json({ entries });
  } catch (error) {
    return handleStoreError("Failed to list expression entries.", error);
  }
}

export async function POST(request: Request) {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "表現の保存にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  if (Number(request.headers.get("content-length") || 0) > 8_000) {
    return NextResponse.json(
      { error: { code: "input_too_large", message: "入力が長すぎます。短い表現にしてください。" } },
      { status: 413 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const inputJa = getString(body?.inputJa);

  if (!inputJa) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "言いたいことを日本語で入力してください。" } },
      { status: 400 },
    );
  }

  if (inputJa.length > 2_000) {
    return NextResponse.json(
      { error: { code: "input_too_large", message: "入力は2,000文字以内にしてください。" } },
      { status: 400 },
    );
  }

  try {
    const entry = await createExpressionEntry({
      ownerLogin,
      inputJa,
      genreSlug: normalizeGenre(body?.genreSlug),
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return handleStoreError("Failed to create expression entry.", error);
  }
}

function handleStoreError(message: string, error: unknown) {
  if (error instanceof ExpressionDatabaseUnavailableError) {
    return NextResponse.json(
      { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。入力は端末に退避できます。" } },
      { status: 503 },
    );
  }

  logServerError(message, error);
  return NextResponse.json(
    { error: { code: "database_error", message: "保存先の読み書きに失敗しました。migrationとDATABASE_URLを確認してください。" } },
    { status: 502 },
  );
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGenre(value: unknown): string {
  return getString(value).slice(0, 120);
}
