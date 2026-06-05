import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions, isDevAuthBypassEnabled, isOwnerSession } from "@/lib/auth";
import {
  isCardPersistenceConfigured,
  saveStoredSceneCard,
} from "@/lib/card-store";
import type { SceneCard } from "@/lib/scenes";

export const runtime = "nodejs";

type SaveCardRequestBody = {
  card?: unknown;
};

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (contentLength > 16_000) {
    return NextResponse.json(
      { error: "カードが長すぎます。内容を短くしてください。" },
      { status: 413 },
    );
  }

  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "カード保存にはログインが必要です。" },
        { status: 401 },
      );
    }

    if (!isOwnerSession(session)) {
      return NextResponse.json(
        { error: "カード保存はownerだけが実行できます。" },
        { status: 403 },
      );
    }
  }

  if (!isCardPersistenceConfigured()) {
    return NextResponse.json(
      { error: "Neonへのカード保存にはDATABASE_URLが必要です。" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | SaveCardRequestBody
    | null;

  if (!body || !body.card || typeof body.card !== "object" || Array.isArray(body.card)) {
    return NextResponse.json(
      { error: "保存するカードの形式が正しくありません。" },
      { status: 400 },
    );
  }

  try {
    const storedCard = await saveStoredSceneCard(body.card as SceneCard);

    return NextResponse.json({
      card: storedCard,
      persistence: {
        configured: true,
        saved: true,
      },
    });
  } catch (error) {
    console.error("Failed to save scene card.", error);

    return NextResponse.json(
      {
        error:
          "Neonへのカード保存に失敗しました。DATABASE_URLとmigration状態を確認してください。",
      },
      { status: 502 },
    );
  }
}
