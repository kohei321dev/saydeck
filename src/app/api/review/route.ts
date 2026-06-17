import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { AiModelNotAllowedError, MissingAiApiKeyError } from "@/lib/ai-config";
import { reviewAnswerWithAi } from "@/lib/ai-review";
import {
  authOptions,
  canUsePractice,
  isDevAuthBypassEnabled,
  isOwnerSession,
} from "@/lib/auth";
import { logServerError } from "@/lib/log-redaction";
import { getSceneCards } from "@/lib/scenes";

export const runtime = "nodejs";

const maxAnswerLength = 1200;

type ReviewRequestBody = {
  answer?: unknown;
  cardId?: unknown;
  level?: unknown;
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  let aiRole: "owner" | "viewer" = "owner";

  if (contentLength > 8_000) {
    return NextResponse.json(
      { error: "回答が長すぎます。短い英文にしてから再実行してください。" },
      { status: 413 },
    );
  }

  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "AI添削にはログインが必要です。" },
        { status: 401 },
      );
    }

    if (!canUsePractice(session)) {
      return NextResponse.json(
        { error: "このユーザーはAI添削を実行できません。" },
        { status: 403 },
      );
    }

    aiRole = isOwnerSession(session) ? "owner" : "viewer";
  }

  const body = (await request.json().catch(() => null)) as ReviewRequestBody | null;

  if (!body) {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません。" },
      { status: 400 },
    );
  }

  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const selectedLevel = typeof body.level === "string" ? body.level : "";

  if (!answer) {
    return NextResponse.json(
      { error: "添削する回答を入力してください。" },
      { status: 400 },
    );
  }

  if (answer.length > maxAnswerLength) {
    return NextResponse.json(
      { error: "回答が長すぎます。短い英文にしてから再実行してください。" },
      { status: 400 },
    );
  }

  const cards = await getSceneCards();
  const card = cards.find((candidate) => candidate.id === cardId);
  const level = card?.levels.find((candidate) => candidate.level === selectedLevel);

  if (!card || !level) {
    return NextResponse.json(
      { error: "指定されたカードまたは難易度が見つかりません。" },
      { status: 404 },
    );
  }

  try {
    const review = await reviewAnswerWithAi({ answer, card, level, role: aiRole });
    return NextResponse.json({ review });
  } catch (error) {
    if (error instanceof MissingAiApiKeyError) {
      return NextResponse.json(
        { error: "AI keyが設定されていません。" },
        { status: 503 },
      );
    }

    if (error instanceof AiModelNotAllowedError) {
      logServerError("AI review model is not allowed.", error, { aiRole });

      return NextResponse.json(
        { error: "許可されていないAI modelが設定されています。" },
        { status: 503 },
      );
    }

    logServerError("AI review failed.", error, { aiRole });

    return NextResponse.json(
      { error: "AI添削に失敗しました。少し時間を置いて再実行してください。" },
      { status: 502 },
    );
  }
}
