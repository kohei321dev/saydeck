import { getSql, isDatabaseConfigured } from "@/lib/db";
import { logServerError } from "@/lib/log-redaction";
import type { ReviewResult } from "@/lib/ai-review";

export type PracticeAttempt = {
  id: string;
  ownerLogin: string;
  cardId: string;
  level: string;
  answer: string;
  review: ReviewResult | null;
  score: number | null;
  practicedAt: string;
  createdAt: string;
};

export type SavedNote = {
  id: string;
  ownerLogin: string;
  cardId: string;
  level: string;
  sceneJa: string;
  answer: string;
  review: ReviewResult | null;
  score: number | null;
  tags: string[];
  sourceAttemptId: string | null;
  savedAt: string;
  createdAt: string;
};

export type PracticeStorageReadiness = {
  practiceAttemptsReady: boolean;
  savedNotesReady: boolean;
};

type PracticeAttemptRow = {
  id: string;
  owner_login: string;
  item_id: string;
  level: string;
  answer: string;
  review: unknown;
  score: number | null;
  practiced_at: Date | string;
  created_at: Date | string;
};

type SavedNoteRow = {
  id: string;
  owner_login: string;
  item_id: string;
  level: string;
  scene_ja: string;
  answer: string;
  review: unknown;
  score: number | null;
  tags: string[] | null;
  source_attempt_id: string | null;
  saved_at: Date | string;
  created_at: Date | string;
};

export type CreatePracticeAttemptInput = {
  id: string;
  ownerLogin: string;
  cardId: string;
  level: string;
  answer: string;
  review: ReviewResult | null;
  practicedAt: string;
};

export type CreateSavedNoteInput = {
  id: string;
  ownerLogin: string;
  cardId: string;
  level: string;
  sceneJa: string;
  answer: string;
  review: ReviewResult | null;
  tags: string[];
  sourceAttemptId: string | null;
  savedAt: string;
};

export async function getPracticeStorageReadiness(): Promise<PracticeStorageReadiness> {
  if (!isDatabaseConfigured()) {
    return {
      practiceAttemptsReady: false,
      savedNotesReady: false,
    };
  }

  try {
    const sql = getSql();
    const rows = await sql<
      {
        practice_attempts_ready: boolean;
        saved_notes_ready: boolean;
      }[]
    >`
      select
        to_regclass('public.practice_attempts') is not null as practice_attempts_ready,
        to_regclass('public.saved_notes') is not null as saved_notes_ready
    `;

    return {
      practiceAttemptsReady: rows[0]?.practice_attempts_ready === true,
      savedNotesReady: rows[0]?.saved_notes_ready === true,
    };
  } catch (error) {
    logServerError("Failed to check practice storage readiness.", error);
    return {
      practiceAttemptsReady: false,
      savedNotesReady: false,
    };
  }
}

export async function createPracticeAttempt({
  id,
  ownerLogin,
  cardId,
  level,
  answer,
  review,
  practicedAt,
}: CreatePracticeAttemptInput): Promise<PracticeAttempt> {
  const sql = getSql();
  const rows = await sql<PracticeAttemptRow[]>`
    insert into practice_attempts (
      id,
      owner_login,
      mode,
      item_id,
      level,
      answer,
      review,
      score,
      practiced_at
    )
    values (
      ${id},
      ${ownerLogin},
      'topic',
      ${cardId},
      ${level},
      ${answer},
      ${review ? sql.json(review) : null},
      ${review?.score ?? null},
      ${practicedAt}
    )
    on conflict (id) do update set id = excluded.id
    returning id, owner_login, item_id, level, answer, review, score, practiced_at, created_at
  `;

  return rowToPracticeAttempt(rows[0]);
}

export async function createSavedNote({
  id,
  ownerLogin,
  cardId,
  level,
  sceneJa,
  answer,
  review,
  tags,
  sourceAttemptId,
  savedAt,
}: CreateSavedNoteInput): Promise<SavedNote> {
  const sql = getSql();
  const rows = await sql<SavedNoteRow[]>`
    insert into saved_notes (
      id,
      owner_login,
      mode,
      item_id,
      level,
      scene_ja,
      answer,
      review,
      score,
      tags,
      source_attempt_id,
      saved_at
    )
    values (
      ${id},
      ${ownerLogin},
      'topic',
      ${cardId},
      ${level},
      ${sceneJa},
      ${answer},
      ${review ? sql.json(review) : null},
      ${review?.score ?? null},
      ${tags},
      ${sourceAttemptId},
      ${savedAt}
    )
    on conflict (id) do update set id = excluded.id
    returning id, owner_login, item_id, level, scene_ja, answer, review, score, tags, source_attempt_id, saved_at, created_at
  `;

  return rowToSavedNote(rows[0]);
}

export async function listSavedNotes(ownerLogin: string): Promise<SavedNote[]> {
  const sql = getSql();
  const rows = await sql<SavedNoteRow[]>`
    select id, owner_login, item_id, level, scene_ja, answer, review, score, tags, source_attempt_id, saved_at, created_at
    from saved_notes
    where owner_login = ${ownerLogin}
      and mode = 'topic'
    order by saved_at desc
    limit 50
  `;

  return rows.map(rowToSavedNote);
}

export async function listPracticeAttempts(
  ownerLogin: string,
): Promise<PracticeAttempt[]> {
  const sql = getSql();
  const rows = await sql<PracticeAttemptRow[]>`
    select id, owner_login, item_id, level, answer, review, score, practiced_at, created_at
    from practice_attempts
    where owner_login = ${ownerLogin}
      and mode = 'topic'
    order by practiced_at desc
    limit 100
  `;

  return rows.map(rowToPracticeAttempt);
}

function rowToPracticeAttempt(row: PracticeAttemptRow): PracticeAttempt {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    cardId: row.item_id,
    level: row.level,
    answer: row.answer,
    review: normalizeReview(row.review),
    score: row.score,
    practicedAt: toIsoString(row.practiced_at),
    createdAt: toIsoString(row.created_at),
  };
}

function rowToSavedNote(row: SavedNoteRow): SavedNote {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    cardId: row.item_id,
    level: row.level,
    sceneJa: row.scene_ja,
    answer: row.answer,
    review: normalizeReview(row.review),
    score: row.score,
    tags: Array.isArray(row.tags) ? row.tags : [],
    sourceAttemptId: row.source_attempt_id,
    savedAt: toIsoString(row.saved_at),
    createdAt: toIsoString(row.created_at),
  };
}

function normalizeReview(value: unknown): ReviewResult | null {
  const parsed = readJson(value);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const source = parsed as Record<string, unknown>;

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

function readJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
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

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
