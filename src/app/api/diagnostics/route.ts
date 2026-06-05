import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import {
  authOptions,
  isAuthBypassRequestEnabled,
  isOwnerSession,
} from "@/lib/auth";
import { getRuntimeDiagnostics } from "@/lib/runtime-diagnostics";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthBypassRequestEnabled(request)) {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "診断情報の確認にはログインが必要です。" },
        { status: 401 },
      );
    }

    if (!isOwnerSession(session)) {
      return NextResponse.json(
        { error: "診断情報はownerだけが確認できます。" },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({ diagnostics: await getRuntimeDiagnostics() });
}
