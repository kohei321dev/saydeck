import { getSql } from "@/lib/db";
import type { ReviewResult } from "@/lib/ai-review";

export type PracticeStatus = "new" | "learned" | "review";

export type StoredPractice = {
  answer: string;
  isDone: boolean;
  lastPracticedAt: string | null;
  needsReview: boolean;
  review: ReviewResult | null;
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
  review: unknown;
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

/**
 * Attempts to parse a string as JSON; returns non-string inputs unchanged.
 *
 * @param value - The value to parse if it is a JSON string
 * @returns The parsed value when `value` is a JSON string, the original `value` when it is not a string, or `undefined` if parsing fails
 */
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

/**
 * Parse an arbitrary value into a PracticeStateJson object.
 *
 * @param value - A value or JSON string to interpret as practice state
 * @returns The parsed `PracticeStateJson`, or an empty object if `value` is not an object or is an array
 */
function normalizeStateJson(value: unknown): PracticeStateJson {
  const parsed = readJson(value);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as PracticeStateJson;
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
 * Determine the practice status from stored practice flags.
 *
 * @returns `review` if `needsReview` is true, `learned` if `isDone` is true, `new` otherwise.
 */
function statusFromPractice({
  isDone,
  needsReview,
}: Pick<StoredPractice, "isDone" | "needsReview">): PracticeStatus {
  if (needsReview) {
    return "review";
  }

  if (isDone) {
    return "learned";
  }

  return "new";
}

/**
 * Convert a Date or date string to an ISO 8601 timestamp.
 *
 * @param value - A Date object or a string parseable by Date
 * @returns An ISO 8601 formatted string (UTC) representing `value`
 */
function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Converts a database row from `practice_records` into a `PracticeRecord` with normalized state and ISO timestamps.
 *
 * @param row - A `PracticeRecordRow` (snake_case DB row) containing `checks`, `status`, `created_at`, `updated_at`, and identifier fields.
 * @returns The corresponding `PracticeRecord` including identifiers, `answer`, normalized `isDone`, `needsReview`, `lastPracticedAt`, `status`, and `createdAt`/`updatedAt` as ISO 8601 strings.
 */
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
    review: normalizeReview(row.review),
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt,
  };
}

/**
 * Retrieves the practice record for a specific owner, card, and level.
 *
 * @returns The matching `PracticeRecord` if found, or `null` if no record exists.
 */
export async function getPracticeRecord({
  ownerLogin,
  cardId,
  level,
}: PracticeRecordKey): Promise<PracticeRecord | null> {
  const sql = getSql();
  const rows = await sql<PracticeRecordRow[]>`
    select owner_login, item_id, level, answer, checks, review, status, created_at, updated_at
    from practice_records
    where owner_login = ${ownerLogin}
      and mode = 'topic'
      and item_id = ${cardId}
      and level = ${level}
    limit 1
  `;

  return rows[0] ? rowToPracticeRecord(rows[0]) : null;
}

/**
 * Insert or update a practice record for the given owner, card, and level, then return the resulting record.
 *
 * @param ownerLogin - The owner's login
 * @param cardId - The card (item) identifier
 * @param level - The practice level
 * @param answer - The stored answer text
 * @param isDone - `true` if the item is marked as done/learned
 * @param lastPracticedAt - ISO 8601 timestamp string of the last practice time, or `null`
 * @param needsReview - `true` if the item should be scheduled for review
 * @param review - Latest AI review result, if one has been saved
 * @returns The saved PracticeRecord including normalized timestamps and the derived `status`
 */
export async function upsertPracticeRecord({
  ownerLogin,
  cardId,
  level,
  answer,
  isDone,
  lastPracticedAt,
  needsReview,
  review,
}: UpsertPracticeRecordInput): Promise<PracticeRecord> {
  const sql = getSql();
  const status = statusFromPractice({ isDone, needsReview });
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
      review,
      status,
      updated_at
    )
    values (
      ${ownerLogin},
      'topic',
      ${cardId},
      ${level},
      ${answer},
      ${sql.json(state)},
      ${review ? sql.json(review) : null},
      ${status},
      now()
    )
    on conflict (owner_login, mode, item_id, level)
    do update set
      answer = excluded.answer,
      checks = excluded.checks,
      review = excluded.review,
      status = excluded.status,
      updated_at = now()
    returning owner_login, item_id, level, answer, checks, review, status, created_at, updated_at
  `;

  return rowToPracticeRecord(rows[0]);
}
