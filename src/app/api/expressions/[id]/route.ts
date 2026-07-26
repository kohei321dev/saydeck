import { NextResponse } from "next/server";

import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import {
  approveExpressionEntry,
  archiveExpressionEntry,
  ExpressionBasicVariantRequiredError,
  ExpressionDatabaseUnavailableError,
  ExpressionSelectionError,
  ExpressionSituationRequiredError,
  ExpressionVariantUpdateError,
  getExpressionEntry,
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
      { error: { code: "unauthorized", message: "ownerログインが必要です。" } },
      { status: 401 },
    );
  }

  try {
    const entry = await getExpressionEntry(ownerLogin, decodeURIComponent((await context.params).id));

    if (!entry) {
      return NextResponse.json(
        { error: { code: "not_found", message: "表現が見つかりません。" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ entry });
  } catch (error) {
    return handleError("Failed to read expression entry.", error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "承認にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const selectedVariantIds = Array.isArray(body?.selectedVariantIds)
    ? body.selectedVariantIds.filter((value): value is string => typeof value === "string").slice(0, 100)
    : [];

  const variantUpdates = Array.isArray(body?.variants)
    ? body.variants.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string") return [];
      return [{
        id: item.id,
        expressionEn: typeof item.expressionEn === "string" ? item.expressionEn : undefined,
        translationJa: typeof item.translationJa === "string" ? item.translationJa : undefined,
      }];
    }).slice(0, 100)
    : undefined;
  if (selectedVariantIds.length === 0) {
    return NextResponse.json(
      { error: { code: "no_selection", message: "登録する表現を1つ以上選択してください。" } },
      { status: 400 },
    );
  }

  try {
    const entry = await approveExpressionEntry({
      ownerLogin,
      entryId: decodeURIComponent((await context.params).id),
      selectedVariantIds,
      variantUpdates,
      classification: {
        primarySituationId: readString(body?.primarySituationId),
        primarySituationLabelJa: readString(body?.primarySituationLabelJa),
        secondarySituationLabelJa: readString(body?.secondarySituationLabelJa),
        selectedBy: body?.situationSelectedBy === "user" ? "user" : "ai",
      },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof ExpressionSelectionError) {
      return NextResponse.json(
        { error: { code: "no_selection", message: "この表現に属する候補を1つ以上選択してください。" } },
        { status: 400 },
      );
    }

    if (error instanceof ExpressionVariantUpdateError) {
      return NextResponse.json(
        { error: { code: "invalid_variant", message: "英文候補の編集内容を確認してください。" } },
        { status: 400 },
      );
    }

    if (error instanceof ExpressionBasicVariantRequiredError) {
      return NextResponse.json(
        { error: { code: "basic_required", message: "各意味単位の01_基本表現は必ず選択してください。" } },
        { status: 400 },
      );
    }

    if (error instanceof ExpressionSituationRequiredError) {
      return NextResponse.json(
        { error: { code: "situation_required", message: "主・副シチュエーションを確認してください。" } },
        { status: 400 },
      );
    }

    return handleError("Failed to approve expression entry.", error);
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ownerLogin = await getExpressionOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "削除にはownerログインが必要です。" } },
      { status: 401 },
    );
  }

  try {
    const archived = await archiveExpressionEntry({
      ownerLogin,
      entryId: decodeURIComponent((await context.params).id),
    });

    if (!archived) {
      return NextResponse.json(
        { error: { code: "not_found", message: "表現が見つかりません。" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ archived: true });
  } catch (error) {
    return handleError("Failed to archive expression entry.", error);
  }
}

function handleError(message: string, error: unknown) {
  if (error instanceof ExpressionDatabaseUnavailableError) {
    return NextResponse.json(
      { error: { code: "database_not_configured", message: "Neon/Postgresが設定されていません。" } },
      { status: 503 },
    );
  }

  logServerError(message, error);
  return NextResponse.json(
    { error: { code: "database_error", message: "表現データの読み書きに失敗しました。" } },
    { status: 502 },
  );
}
