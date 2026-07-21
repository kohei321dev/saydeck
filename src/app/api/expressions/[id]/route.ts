import { NextResponse } from "next/server";

import { getExpressionOwnerLogin } from "@/lib/expression-auth";
import {
  approveExpressionEntry,
  ExpressionDatabaseUnavailableError,
  ExpressionSelectionError,
  ExpressionSituationTagsRequiredError,
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
        english: typeof item.english === "string" ? item.english : undefined,
        japanese: typeof item.japanese === "string" ? item.japanese : undefined,
        keyExpression: typeof item.keyExpression === "string" ? item.keyExpression : undefined,
        definitionJa: typeof item.definitionJa === "string" ? item.definitionJa : undefined,
        irregularForms: typeof item.irregularForms === "string" ? item.irregularForms : undefined,
      }];
    }).slice(0, 100)
    : undefined;
  const genreSlug = typeof body?.genreSlug === "string" ? body.genreSlug.trim().slice(0, 120) : undefined;
  if (selectedVariantIds.length === 0) {
    return NextResponse.json(
      { error: { code: "no_selection", message: "登録するレベルを1つ以上選択してください。" } },
      { status: 400 },
    );
  }

  try {
    const entry = await approveExpressionEntry({
      ownerLogin,
      entryId: decodeURIComponent((await context.params).id),
      selectedVariantIds,
      variantUpdates,
      genreSlug,
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

    if (error instanceof ExpressionSituationTagsRequiredError) {
      return NextResponse.json(
        { error: { code: "situation_tags_required", message: "シチュエーションタグの生成に失敗しました。候補を再生成してください。" } },
        { status: 400 },
      );
    }

    return handleError("Failed to approve expression entry.", error);
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
