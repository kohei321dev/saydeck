import { getSql } from "@/lib/db";
import type { LevelCode } from "@/lib/data";

export type PracticeMode = "topic" | "diary";
export type PracticeStatus = "new" | "learned" | "review";
export type PracticeCheckKey =
  | "meaning"
  | "subjectVerb"
  | "tense"
  | "stolenPhrase"
  | "speakable";

export type PracticeChecks = Record<PracticeCheckKey, boolean>;

export type PracticeReview = {
  score: number;
  goodPoint: string;
  fix: string;
  naturalAnswer: string;
  phraseToRemember: string;
  nextPractice: string;
};

export type StoredPractice = {
  answer: string;
  checks: PracticeChecks;
  status: PracticeStatus;
  review?: PracticeReview;
};

export type PracticeRecord = StoredPractice & {
  ownerLogin: string;
  mode: PracticeMode;
  itemId: string;
  level: LevelCode;
  createdAt: string;
  updatedAt: string;
};

type PracticeRecordRow = {
  owner_login: string;
  mode: PracticeMode;
  item_id: string;
  level: LevelCode;
  answer: string;
  checks: unknown;
  status: PracticeStatus;
  review: unknown | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type PracticeRecordKey = {
  ownerLogin: string;
  mode: PracticeMode;
  itemId: string;
  level: LevelCode;
};

type UpsertPracticeRecordInput = PracticeRecordKey & StoredPractice;

const emptyChecks: PracticeChecks = {
  meaning: false,
  subjectVerb: false,
  tense: false,
  stolenPhrase: false,
  speakable: false,
};

function readJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeChecks(value: unknown): PracticeChecks {
  const parsed = readJson(value);

  if (!parsed || typeof parsed !== "object") {
    return { ...emptyChecks };
  }

  const source = parsed as Partial<Record<PracticeCheckKey, unknown>>;

  return {
    meaning: source.meaning === true,
    subjectVerb: source.subjectVerb === true,
    tense: source.tense === true,
    stolenPhrase: source.stolenPhrase === true,
    speakable: source.speakable === true,
  };
}

function normalizeReview(value: unknown): PracticeReview | undefined {
  const parsed = readJson(value);

  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }

  const source = parsed as Partial<PracticeReview>;

  if (
    typeof source.score !== "number" ||
    typeof source.goodPoint !== "string" ||
    typeof source.fix !== "string" ||
    typeof source.naturalAnswer !== "string" ||
    typeof source.phraseToRemember !== "string" ||
    typeof source.nextPractice !== "string"
  ) {
    return undefined;
  }

  return {
    score: source.score,
    goodPoint: source.goodPoint,
    fix: source.fix,
    naturalAnswer: source.naturalAnswer,
    phraseToRemember: source.phraseToRemember,
    nextPractice: source.nextPractice,
  };
}

function rowToPracticeRecord(row: PracticeRecordRow): PracticeRecord {
  return {
    ownerLogin: row.owner_login,
    mode: row.mode,
    itemId: row.item_id,
    level: row.level,
    answer: row.answer,
    checks: normalizeChecks(row.checks),
    status: row.status,
    review: normalizeReview(row.review),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };
}

export async function getPracticeRecord({
  ownerLogin,
  mode,
  itemId,
  level,
}: PracticeRecordKey) {
  const sql = getSql();
  const rows = await sql<PracticeRecordRow[]>`
    select owner_login, mode, item_id, level, answer, checks, status, review, created_at, updated_at
    from practice_records
    where owner_login = ${ownerLogin}
      and mode = ${mode}
      and item_id = ${itemId}
      and level = ${level}
    limit 1
  `;

  return rows[0] ? rowToPracticeRecord(rows[0]) : null;
}

export async function upsertPracticeRecord({
  ownerLogin,
  mode,
  itemId,
  level,
  answer,
  checks,
  status,
  review,
}: UpsertPracticeRecordInput) {
  const sql = getSql();
  const rows = await sql<PracticeRecordRow[]>`
    insert into practice_records (
      owner_login,
      mode,
      item_id,
      level,
      answer,
      checks,
      status,
      review,
      updated_at
    )
    values (
      ${ownerLogin},
      ${mode},
      ${itemId},
      ${level},
      ${answer},
      ${JSON.stringify(checks)}::jsonb,
      ${status},
      ${review ? JSON.stringify(review) : null}::jsonb,
      now()
    )
    on conflict (owner_login, mode, item_id, level)
    do update set
      answer = excluded.answer,
      checks = excluded.checks,
      status = excluded.status,
      review = excluded.review,
      updated_at = now()
    returning owner_login, mode, item_id, level, answer, checks, status, review, created_at, updated_at
  `;

  return rowToPracticeRecord(rows[0]);
}
