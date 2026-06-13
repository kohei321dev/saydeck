import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import {
  generateSceneCardWithAi,
  MissingCardGenerationApiKeyError,
} from "@/lib/ai-card-generation";
import { authOptions, isDevAuthBypassEnabled, isOwnerSession } from "@/lib/auth";
import {
  isCardPersistenceConfigured,
  saveStoredSceneCard,
} from "@/lib/card-store";

export const runtime = "nodejs";

type GenerateCardRequestBody = {
  category?: unknown;
  persist?: unknown;
  sceneJa?: unknown;
  tags?: unknown;
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (contentLength > 4_000) {
    return NextResponse.json(
      { error: "入力が長すぎます。短いシチュエーションにしてください。" },
      { status: 413 },
    );
  }

  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "カード追加にはログインが必要です。" },
        { status: 401 },
      );
    }

    if (!isOwnerSession(session)) {
      return NextResponse.json(
        { error: "カード追加はownerだけが実行できます。" },
        { status: 403 },
      );
    }
  }

  const body = (await request.json().catch(() => null)) as
    | GenerateCardRequestBody
    | null;

  if (!body) {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません。" },
      { status: 400 },
    );
  }

  const category = getString(body.category) || "custom";
  const shouldPersist = body.persist !== false;
  const sceneJa = getString(body.sceneJa);
  const tags = getTags(body.tags);

  if (!sceneJa) {
    return NextResponse.json(
      { error: "シチュエーションを入力してください。" },
      { status: 400 },
    );
  }

  if (sceneJa.length > 300) {
    return NextResponse.json(
      { error: "シチュエーションが長すぎます。300文字以内にしてください。" },
      { status: 400 },
    );
  }

  let card: Awaited<ReturnType<typeof generateSceneCardWithAi>>;

  try {
    card = await generateSceneCardWithAi({ category, sceneJa, tags });
  } catch (error) {
    if (error instanceof MissingCardGenerationApiKeyError) {
      return NextResponse.json(
        { error: "OWNER_AI_KEYまたはOWNER_AI_MODELが正しく設定されていません。" },
        { status: 503 },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error: "カード生成に失敗しました。少し時間を置いて再実行してください。",
      },
      { status: 502 },
    );
  }

  if (!shouldPersist) {
    return NextResponse.json({
      card,
      persistence: {
        configured: isCardPersistenceConfigured(),
        saved: false,
      },
    });
  }

  if (!isCardPersistenceConfigured()) {
    return NextResponse.json(
      { error: "Neonへのカード保存にはDATABASE_URLが必要です。" },
      { status: 503 },
    );
  }

  try {
    const storedCard = await saveStoredSceneCard(card);

    return NextResponse.json({
      card: storedCard,
      persistence: {
        configured: true,
        saved: true,
      },
    });
  } catch (error) {
    console.error("Failed to save generated scene card.", error);

    return NextResponse.json(
      {
        error:
          "Neonへのカード保存に失敗しました。DATABASE_URLとmigration状態を確認してください。",
      },
      { status: 502 },
    );
  }
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(getString).filter(Boolean).slice(0, 8);
  }

  if (typeof value === "string") {
    return value.split(";").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  }

  return [];
}
