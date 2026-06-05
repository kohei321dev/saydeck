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
import type { ReviewResult } from "@/lib/ai-review";

export const runtime = "nodejs";

const validLevels = new Set(["L1", "L2", "L3", "L4"]);

/**
 * Resolve the authenticated owner's GitHub login.
 *
 * When a development auth bypass is enabled, returns the configured owner GitHub username.
 *
 * @returns The owner's GitHub login when the request is authenticated as the owner or when development auth bypass is enabled; `null` otherwise.
 */
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

/**
 * Return a JSON 503 response indicating the database URL is not configured.
 *
 * @returns A Next.js JSON response with `{ error: "DATABASE_URL is not configured" }` and HTTP status 503.
 */
function databaseUnavailable() {
  return NextResponse.json(
    { error: "DATABASE_URL is not configured" },
    { status: 503 },
  );
}

/**
 * Validate and normalize a practice key from raw input.
 *
 * @param value - Object with `cardId` and `level` fields to validate and normalize.
 * @returns `{ cardId, level }` when `cardId` is a trimmed, non-empty string of at most 120 characters and `level` is one of the accepted levels; `null` otherwise.
 */
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

/**
 * Validates and normalizes a practice record payload from an external source.
 *
 * Attempts to read `cardId` and `level` and, if valid, returns a normalized object
 * containing `cardId`, `level`, `answer`, `isDone`, `lastPracticedAt`, and `needsReview`.
 *
 * @param value - The raw payload to validate (expected to be an object with fields like `cardId`, `level`, `answer`, `isDone`, `lastPracticedAt`, `needsReview`)
 * @returns The normalized practice payload:
 * - `cardId` (string)
 * - `level` (string)
 * - `answer` (string, truncated to empty string when absent)
 * - `isDone` (boolean)
 * - `lastPracticedAt` (string | null)
 * - `needsReview` (boolean)
 * or `null` if the input is not an object, has an invalid key (`cardId`/`level`), or violates constraints (e.g., `answer` longer than 4000 characters).
 */
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
  const review = readReview(source.review);

  if (answer.length > 4000) {
    return null;
  }

  return {
    ...key,
    answer,
    isDone: source.isDone === true,
    lastPracticedAt,
    needsReview: source.needsReview === true,
    review,
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

/**
 * Handle GET requests to read a practice record for the authenticated owner.
 *
 * @returns A JSON response with one of:
 * - `{ record }` for the requested practice record on success.
 * - `{ error: "Unauthorized" }` with HTTP 401 when the caller is not the owner.
 * - `{ error: "Invalid request" }` with HTTP 400 when query parameters are missing or invalid.
 * - `{ error: "DATABASE_URL is not configured" }` with HTTP 503 when the database is not configured.
 */
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

/**
 * Upserts a practice record for the authenticated owner and returns the stored record.
 *
 * Validates authentication, database configuration, and request payload shape/constraints.
 * Responds with 401 when the requester is not the owner, 503 when the database is not configured,
 * and 400 when the request body is invalid.
 *
 * @returns A JSON response. On success: `{ record }` with the upserted practice record. On error: `{ error }` with an appropriate HTTP status (`401`, `400`, or `503`).
 */
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
