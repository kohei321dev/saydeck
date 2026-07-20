import { NextResponse } from "next/server";

import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import { AnkiExportUnavailableError, getAnkiExportRecords, recordsToAnkiTsv } from "@/lib/anki-export";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ownerLogin = await getExpressionOwnerLogin();
  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "TSV exportにはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const records = await getAnkiExportRecords(ownerLogin, {
      variantIds: readStringList(body.variantIds),
      tags: readStringList(body.tags),
      from: getString(body.from),
      to: getString(body.to),
      includeSamples: body.includeSamples === true,
    });
    if (records.length === 0) {
      return NextResponse.json(
        { error: { code: "no_cards", message: "条件に一致する登録済みカードがありません。" } },
        { status: 404 },
      );
    }

    return new NextResponse(recordsToAnkiTsv(records), {
      status: 200,
      headers: {
        "Content-Type": "text/tab-separated-values; charset=utf-8",
        "Content-Disposition": `attachment; filename="saydeck-anki-${new Date().toISOString().slice(0, 10)}.tsv"`,
        "X-SayDeck-Card-Count": String(records.length),
      },
    });
  } catch (error) {
    if (error instanceof AnkiExportUnavailableError) {
      return NextResponse.json(
        { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
        { status: 503 },
      );
    }
    logServerError("Failed to export Anki TSV.", error);
    return NextResponse.json(
      { error: { code: "export_failed", message: "Anki TSVの生成に失敗しました。" } },
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
