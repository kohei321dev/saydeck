import { NextResponse } from "next/server";

import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import {
  ExpressionDatabaseUnavailableError,
  listSituationDefinitions,
} from "@/lib/expression-store";
import { logServerError } from "@/lib/log-redaction";

export const runtime = "nodejs";

export async function GET() {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "分類の確認にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  try {
    const situations = await listSituationDefinitions(ownerLogin);
    return NextResponse.json({
      primarySituations: situations.filter((item) => item.kind === "primary"),
      secondarySituations: situations.filter((item) => item.kind === "secondary"),
    });
  } catch (error) {
    if (error instanceof ExpressionDatabaseUnavailableError) {
      return NextResponse.json(
        { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
        { status: 503 },
      );
    }

    logServerError("Failed to list situations.", error);
    return NextResponse.json(
      { error: { code: "database_error", message: "シチュエーションを読み込めませんでした。" } },
      { status: 502 },
    );
  }
}
