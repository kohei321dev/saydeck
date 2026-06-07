import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import {
  authOptions,
  isDevAuthBypassEnabled,
  isOwnerSession,
  ownerGithubUsername,
} from "@/lib/auth";
import type { ReviewResult } from "@/lib/ai-review";
import { isDatabaseConfigured } from "@/lib/db";
import { createSavedNote, listSavedNotes } from "@/lib/practice-notes";

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

function readNotePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const cardId = typeof source.cardId === "string" ? source.cardId.trim() : "";
  const level = typeof source.level === "string" ? source.level.trim() : "";
  const sceneJa = typeof source.sceneJa === "string" ? source.sceneJa.trim() : "";
  const answer = typeof source.answer === "string" ? source.answer : "";
  const savedAt = typeof source.savedAt === "string" ? source.savedAt : "";
  const sourceAttemptId =
    typeof source.sourceAttemptId === "string" && source.sourceAttemptId.trim()
      ? source.sourceAttemptId.trim()
      : null;
  const tags = Array.isArray(source.tags)
    ? source.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
    : [];
  const review = readReview(source.review);

  if (
    !id ||
    id.length > 120 ||
    !cardId ||
    cardId.length > 120 ||
    !validLevels.has(level) ||
    sceneJa.length > 400 ||
    answer.length > 4000 ||
    !isValidDateString(savedAt)
  ) {
    return null;
  }

  return {
    id,
    cardId,
    level,
    sceneJa,
    answer,
    review,
    tags,
    sourceAttemptId,
    savedAt,
  };
}

function readReview(value: unknown): ReviewResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;

  return {
    score: clampScore(source.score),
    goodPoint: getString(source.goodPoint),
    fix: getString(source.fix),
    naturalAnswer: getString(source.naturalAnswer),
    phraseToRemember: getString(source.phraseToRemember),
    nextPractice: getString(source.nextPractice),
    sceneFit: getString(source.sceneFit),
  };
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clampScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(10, Math.round(score)));
}

function isValidDateString(value: string): boolean {
  return Boolean(value) && !Number.isNaN(new Date(value).getTime());
}

export async function GET() {
  const ownerLogin = await getOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return databaseUnavailable();
  }

  const notes = await listSavedNotes(ownerLogin);

  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const ownerLogin = await getOwnerLogin();

  if (!ownerLogin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return databaseUnavailable();
  }

  const payload = readNotePayload(await request.json().catch(() => null));

  if (!payload) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const note = await createSavedNote({
    ownerLogin,
    ...payload,
  });

  return NextResponse.json({ note }, { status: 201 });
}
