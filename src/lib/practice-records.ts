import { getSql } from "@/lib/db";

export type PracticeStatus = "new" | "learned" | "review";

export type StoredPractice = {
  answer: string;
  isDone: boolean;
  lastPracticedAt: string | null;
  needsReview: boolean;
};

export type PracticeRecord = StoredPractice & {
  ownerLogin: string;
  cardId: string;
  level: string;
  status: PracticeStatus;
  createdAt: string;
  updatedAt: string;
};

type PracticeRecordRow = {
  owner_login: string;
  item_id: string;
  level: string;
  answer: string;
  checks: unknown;
  status: PracticeStatus;
  created_at: Date | string;
  updated_at: Date | string;
};

type PracticeRecordKey = {
  ownerLogin: string;
  cardId: string;
  level: string;
};

type UpsertPracticeRecordInput = PracticeRecordKey & StoredPractice;

type PracticeStateJson = {
  isDone?: unknown;
  lastPracticedAt?: unknown;
  needsReview?: unknown;
};

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

function normalizeStateJson(value: unknown): PracticeStateJson {
  const parsed = readJson(value);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as PracticeStateJson;
}

function statusFromPractice({ isDone, needsReview }: StoredPractice): PracticeStatus {
  if (needsReview) {
    return "review";
  }

  if (isDone) {
    return "learned";
  }

  return "new";
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function rowToPracticeRecord(row: PracticeRecordRow): PracticeRecord {
  const state = normalizeStateJson(row.checks);
  const updatedAt = toIsoString(row.updated_at);
  const hasLastPracticedAt = Object.prototype.hasOwnProperty.call(
    state,
    "lastPracticedAt",
  );
  const lastPracticedAt =
    typeof state.lastPracticedAt === "string"
      ? state.lastPracticedAt
      : hasLastPracticedAt
        ? null
        : updatedAt;
  const isDone =
    typeof state.isDone === "boolean" ? state.isDone : row.status === "learned";
  const needsReview =
    typeof state.needsReview === "boolean" ? state.needsReview : row.status === "review";

  return {
    ownerLogin: row.owner_login,
    cardId: row.item_id,
    level: row.level,
    answer: row.answer,
    isDone,
    lastPracticedAt,
    needsReview,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt,
  };
}

export async function getPracticeRecord({
  ownerLogin,
  cardId,
  level,
}: PracticeRecordKey): Promise<PracticeRecord | null> {
  const sql = getSql();
  const rows = await sql<PracticeRecordRow[]>`
    select owner_login, item_id, level, answer, checks, status, created_at, updated_at
    from practice_records
    where owner_login = ${ownerLogin}
      and mode = 'topic'
      and item_id = ${cardId}
      and level = ${level}
    limit 1
  `;

  return rows[0] ? rowToPracticeRecord(rows[0]) : null;
}

export async function upsertPracticeRecord({
  ownerLogin,
  cardId,
  level,
  answer,
  isDone,
  lastPracticedAt,
  needsReview,
}: UpsertPracticeRecordInput): Promise<PracticeRecord> {
  const sql = getSql();
  const status = statusFromPractice({ answer, isDone, lastPracticedAt, needsReview });
  const state = {
    isDone,
    lastPracticedAt,
    needsReview,
  };
  const rows = await sql<PracticeRecordRow[]>`
    insert into practice_records (
      owner_login,
      mode,
      item_id,
      level,
      answer,
      checks,
      status,
      updated_at
    )
    values (
      ${ownerLogin},
      'topic',
      ${cardId},
      ${level},
      ${answer},
      ${JSON.stringify(state)}::jsonb,
      ${status},
      now()
    )
    on conflict (owner_login, mode, item_id, level)
    do update set
      answer = excluded.answer,
      checks = excluded.checks,
      status = excluded.status,
      updated_at = now()
    returning owner_login, item_id, level, answer, checks, status, created_at, updated_at
  `;

  return rowToPracticeRecord(rows[0]);
}
