import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions, isDevAuthBypassEnabled, isOwnerSession } from "@/lib/auth";
import { deleteStoredSceneCard, MissingCardStoreError } from "@/lib/card-store";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  if (!isDevAuthBypassEnabled()) {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "カード削除にはログインが必要です。" },
        { status: 401 },
      );
    }

    if (!isOwnerSession(session)) {
      return NextResponse.json(
        { error: "カード削除はownerだけが実行できます。" },
        { status: 403 },
      );
    }
  }

  const { cardId } = await context.params;

  try {
    const deleted = await deleteStoredSceneCard(decodeURIComponent(cardId));
    return NextResponse.json({ deleted });
  } catch (error) {
    if (error instanceof MissingCardStoreError) {
      return NextResponse.json(
        { error: "カード保存先が設定されていません。" },
        { status: 503 },
      );
    }

    console.error(error);

    return NextResponse.json(
      { error: "カード削除に失敗しました。少し時間を置いて再実行してください。" },
      { status: 502 },
    );
  }
}
