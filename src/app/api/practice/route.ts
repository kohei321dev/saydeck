import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import {
  authOptions,
  isDevAuthBypassEnabled,
  isOwnerSession,
  ownerGithubUsername,
} from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { getPracticeRecord, upsertPracticeRecord } from "@/lib/practice-records";

export const runtime = "nodejs";

const validLevels = new Set(["L1", "L2", "L3", "L4"]);

async function getOwnerLogin(): Promise<string | null> {
  if (isDevAuthBypassEnabled()) {
    return ownerGithubUsername;
  }

  const session = await getServerSession(authOptions);

  if (!isOwnerSession(session)) {
    return null;
  }

  return session?.user.githubLogin ?? null;
}

function databaseUnavailable() {
  return NextResponse.json(
    { error: "DATABASE_URL is not configured" },
    { status: 503 },
  );
}

function readPracticeKey(value: {
  cardId: unknown;
  level: unknown;
}): { cardId: string; level: string } | null {
  const cardId = typeof value.cardId === "string" ? value.cardId.trim() : "";
  const level = typeof value.level === "string" ? value.level.trim() : "";

  if (!cardId || cardId.length > 120 || !validLevels.has(level)) {
    return null;
  }

  return { cardId, level };
}

function readPracticePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const key = readPracticeKey({
    cardId: source.cardId,
    level: source.level,
  });

  if (!key) {
    return null;
  }

  const answer = typeof source.answer === "string" ? source.answer : "";
  const lastPracticedAt =
    typeof source.lastPracticedAt === "string" ? source.lastPracticedAt : null;

  if (answer.length > 4000) {
    return null;
  }

  return {
    ...key,
    answer,
    isDone: source.isDone === true,
    lastPracticedAt,
    needsReview: source.needsReview === true,
  };
}

export async function GET(request: Request) {
  const ownerLogin = await getOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return databaseUnavailable();
  }

  const url = new URL(request.url);
  const key = readPracticeKey({
    cardId: url.searchParams.get("cardId"),
    level: url.searchParams.get("level"),
  });

  if (!key) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const record = await getPracticeRecord({ ownerLogin, ...key });

  return NextResponse.json({ record });
}

export async function PUT(request: Request) {
  const ownerLogin = await getOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return databaseUnavailable();
  }

  const payload = readPracticePayload(await request.json().catch(() => null));

  if (!payload) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const record = await upsertPracticeRecord({
    ownerLogin,
    ...payload,
  });

  return NextResponse.json({ record });
}
