import { getServerSession } from "next-auth";

import { AiModelNotAllowedError, MissingAiApiKeyError } from "@/lib/ai-config";
import { reviewAnswerWithAi } from "@/lib/ai-review";
import {
  authOptions,
  canUsePractice,
  isDevAuthBypassEnabled,
  isOwnerSession,
} from "@/lib/auth";
import { logServerError } from "@/lib/log-redaction";
import {
  createRequestContext,
  getRequestContextLogFields,
  jsonWithRequestContext,
} from "@/lib/request-context";
import { getSceneCards } from "@/lib/scenes";

export const runtime = "nodejs";

const maxAnswerLength = 1200;

type ReviewRequestBody = {
  answer?: unknown;
  cardId?: unknown;
  level?: unknown;
};

export async function POST(request: Request) {
  const requestContext = createRequestContext(request, {
    operation: "review_answer",
    route: "/api/review",
  });
  const json = (body: unknown, init?: ResponseInit) =>
    jsonWithRequestContext(body, init, requestContext);
  const contentLength = Number(request.headers.get("content-length") || 0);
  let aiRole: "owner" | "viewer" = "owner";

  if (contentLength > 8_000) {
    return json(
      { error: "回答が長すぎます。短い英文にしてから再実行してください。" },
      { status: 413 },
    );
  }

  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);

    if (!session) {
      return json(
        { error: "AI添削にはログインが必要です。" },
        { status: 401 },
      );
    }

    if (!canUsePractice(session)) {
      return json(
        { error: "このユーザーはAI添削を実行できません。" },
        { status: 403 },
      );
    }

    aiRole = isOwnerSession(session) ? "owner" : "viewer";
  }

  const body = (await request.json().catch(() => null)) as ReviewRequestBody | null;

  if (!body) {
    return json(
      { error: "リクエストの形式が正しくありません。" },
      { status: 400 },
    );
  }

  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const selectedLevel = typeof body.level === "string" ? body.level : "";

  if (!answer) {
    return json(
      { error: "添削する回答を入力してください。" },
      { status: 400 },
    );
  }

  if (answer.length > maxAnswerLength) {
    return json(
      { error: "回答が長すぎます。短い英文にしてから再実行してください。" },
      { status: 400 },
    );
  }

  const cards = await getSceneCards();
  const card = cards.find((candidate) => candidate.id === cardId);
  const level = card?.levels.find((candidate) => candidate.level === selectedLevel);

  if (!card || !level) {
    return json(
      { error: "指定されたカードまたは難易度が見つかりません。" },
      { status: 404 },
    );
  }

  try {
    const review = await reviewAnswerWithAi({ answer, card, level, role: aiRole });
    return json({ review });
  } catch (error) {
    if (error instanceof MissingAiApiKeyError) {
      return json(
        { error: "AI keyが設定されていません。" },
        { status: 503 },
      );
    }

    if (error instanceof AiModelNotAllowedError) {
      logServerError(
        "AI review model is not allowed.",
        error,
        getReviewLogContext(requestContext, aiRole, {
          code: "server_error",
          status: 503,
          retryable: false,
        }),
      );

      return json(
        { error: "許可されていないAI modelが設定されています。" },
        { status: 503 },
      );
    }

    logServerError(
      "AI review failed.",
      error,
      getReviewLogContext(requestContext, aiRole, {
        code: "external_ai_unavailable",
        status: 502,
        retryable: true,
      }),
    );

    return json(
      { error: "AI添削に失敗しました。少し時間を置いて再実行してください。" },
      { status: 502 },
    );
  }
}

function getReviewLogContext(
  requestContext: ReturnType<typeof createRequestContext>,
  aiRole: "owner" | "viewer",
  fields: {
    code: string;
    retryable: boolean;
    status: number;
  },
): Record<string, unknown> {
  return getRequestContextLogFields(requestContext, {
    event: "api_error",
    provider: aiRole === "viewer" ? "viewer_ai" : "owner_ai",
    role: aiRole,
    ...fields,
  });
}
