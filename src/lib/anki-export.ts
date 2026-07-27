import { getSql, isDatabaseConfigured } from "@/lib/db";
import { profileDisplayName, variantDisplayName } from "@/lib/generation-profiles";
import type { GenerationProfileCode, SentenceVariant } from "@/lib/expression-types";

export type AnkiExportFilter = {
  variantIds?: string[];
  from?: string;
  to?: string;
  requireAudio?: boolean;
};

export type AnkiMediaRef = {
  filename: string;
  blobPath: string;
};

export type AnkiExportRecord = {
  variantId: string;
  ankiGuid: string;
  registeredAt: string;
  deckName: string;
  fields: [string, string, string, string, string];
  tags: string[];
  media?: AnkiMediaRef[];
};

export type AnkiExportArtifact = {
  id: string;
  status: "pending" | "ready" | "failed";
  cardCount: number;
  blobPath: string;
  errorCode: string | null;
};

type ExportRow = {
  variant_id: string;
  anki_guid: string;
  anki_index: string;
  profile_code: GenerationProfileCode;
  pattern_code: SentenceVariant["patternCode"];
  expression_en: string;
  translation_ja: string;
  registered_at: Date | string;
  primary_label_ja: string;
  primary_canonical_key: string;
  secondary_label_ja: string;
  secondary_canonical_key: string;
  audio_blob_path: string | null;
  audio_provider: string | null;
  audio_locale: string | null;
  audio_status: "pending" | "ready" | "failed" | "stale" | null;
};

export class AnkiExportUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "AnkiExportUnavailableError";
  }
}

export class AnkiAudioNotReadyError extends Error {
  constructor() {
    super("Selected cards do not have provider-backed en-US expression audio ready.");
    this.name = "AnkiAudioNotReadyError";
  }
}

export async function getAnkiExportRecords(
  ownerLogin: string,
  filter: AnkiExportFilter = {},
): Promise<AnkiExportRecord[]> {
  if (!isDatabaseConfigured()) {
    throw new AnkiExportUnavailableError();
  }

  const sql = getSql();
  const variantIds = normalizeList(filter.variantIds);
  const from = normalizeDate(filter.from);
  const to = normalizeDate(filter.to, true);
  const variantFilter = variantIds.length > 0
    ? sql`v.id in ${sql(variantIds)}`
    : sql`true`;
  const rows = await sql<ExportRow[]>`
    select
      v.id as variant_id,
      v.anki_guid,
      v.anki_index,
      v.profile_code,
      v.pattern_code,
      v.expression_en,
      v.translation_ja,
      e.registered_at,
      primary_situation.label_ja as primary_label_ja,
      primary_situation.canonical_key as primary_canonical_key,
      secondary_situation.label_ja as secondary_label_ja,
      secondary_situation.canonical_key as secondary_canonical_key,
      audio.blob_path as audio_blob_path,
      audio.provider as audio_provider,
      audio.locale as audio_locale,
      audio.status as audio_status
    from sentence_variants v
    join sentence_cards c
      on c.id = v.sentence_card_id and c.owner_login = v.owner_login
    join expression_entries e
      on e.id = c.entry_id and e.owner_login = c.owner_login
    join expression_entry_situations primary_assignment
      on primary_assignment.entry_id = e.id
      and primary_assignment.role = 'primary'
    join situation_definitions primary_situation
      on primary_situation.id = primary_assignment.situation_id
      and primary_situation.owner_login = e.owner_login
    join expression_entry_situations secondary_assignment
      on secondary_assignment.entry_id = e.id
      and secondary_assignment.role = 'secondary'
    join situation_definitions secondary_situation
      on secondary_situation.id = secondary_assignment.situation_id
      and secondary_situation.owner_login = e.owner_login
      and secondary_situation.parent_id = primary_situation.id
    left join audio_assets audio
      on audio.variant_id = v.id and audio.owner_login = v.owner_login
    where v.owner_login = ${ownerLogin}
      and e.status = 'registered'
      and v.is_selected = true
      and ${variantFilter}
      and v.status <> 'archived'
      and e.registered_at is not null
      and (${from ? sql`e.registered_at >= ${from}` : sql`true`})
      and (${to ? sql`e.registered_at < ${to}` : sql`true`})
    order by e.registered_at asc, c.position asc,
      case v.profile_code
        when 'standard' then 1
        when 'native' then 2
        else 3
      end,
      v.pattern_code asc,
      v.anki_guid asc
  `;

  const records = rows.map(rowToRecord);

  if (filter.requireAudio && records.some((record) => !hasReadyAudio(record))) {
    throw new AnkiAudioNotReadyError();
  }

  return records;
}

export async function createAnkiExportArtifact(input: {
  ownerLogin: string;
  id: string;
  status: AnkiExportArtifact["status"];
  cardCount: number;
  blobPath: string;
  errorCode?: string | null;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;

  const sql = getSql();
  await sql`
    insert into anki_exports (id, owner_login, status, card_count, blob_path, error_code)
    values (
      ${input.id}, ${input.ownerLogin}, ${input.status}, ${input.cardCount},
      ${input.blobPath}, ${input.errorCode ?? null}
    )
  `;
}

export async function getAnkiExportArtifact(
  ownerLogin: string,
  exportId: string,
): Promise<AnkiExportArtifact | null> {
  if (!isDatabaseConfigured()) {
    throw new AnkiExportUnavailableError();
  }

  const sql = getSql();
  const rows = await sql<AnkiExportArtifact[]>`
    select id, status, card_count as "cardCount", blob_path as "blobPath",
      error_code as "errorCode"
    from anki_exports
    where owner_login = ${ownerLogin} and id = ${exportId}
    limit 1
  `;

  return rows[0] ?? null;
}

function rowToRecord(row: ExportRow): AnkiExportRecord {
  const safeId = row.variant_id.replace(/[^A-Za-z0-9_-]/g, "_");
  const layerLabel = profileDisplayName(row.profile_code);
  const variantLabel = variantDisplayName(row.profile_code, row.pattern_code);
  const expressionPatternLabel = row.profile_code === "pattern" && row.pattern_code !== "default"
    ? variantLabel
    : null;
  const context = [
    `主: ${row.primary_label_ja}`,
    `副: ${row.secondary_label_ja}`,
    `表現: ${variantLabel}`,
  ].join(" / ");
  const media = appendMedia(row, safeId);

  return {
    variantId: row.variant_id,
    ankiGuid: row.anki_guid,
    registeredAt: toIso(row.registered_at),
    deckName: [
      "SayDeck",
      safeDeckSegment(row.primary_label_ja),
      safeDeckSegment(row.secondary_label_ja),
      layerLabel,
      ...(expressionPatternLabel ? [expressionPatternLabel] : []),
    ].join("::"),
    fields: [
      row.anki_index,
      context,
      row.expression_en,
      row.translation_ja,
      `[sound:saydeck_expression_${safeId}.wav]`,
    ],
    tags: [
      "source::saydeck",
      `primary_situation::${safeTag(row.primary_canonical_key)}`,
      `secondary_situation::${safeTag(row.primary_canonical_key)}::${safeTag(row.secondary_canonical_key)}`,
      `layer::${row.profile_code}`,
      ...(expressionPatternLabel ? [`expression_pattern::${row.pattern_code}`] : []),
    ],
    media,
  };
}

function appendMedia(row: ExportRow, safeId: string): AnkiMediaRef[] {
  if (
    !row.audio_blob_path
    || row.audio_status !== "ready"
    || row.audio_locale !== "en-US"
    || !row.audio_provider
  ) {
    return [];
  }

  return [{
    filename: `saydeck_expression_${safeId}.wav`,
    blobPath: row.audio_blob_path,
  }];
}

function hasReadyAudio(record: AnkiExportRecord): boolean {
  return record.media?.length === 1;
}

function normalizeList(value: string[] | undefined): string[] {
  return Array.from(
    new Set((value ?? []).map((item) => item.trim()).filter(Boolean)),
  ).slice(0, 200);
}

function normalizeDate(
  value: string | undefined,
  moveToNextDay = false,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (moveToNextDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeDeckSegment(value: string): string {
  return value
    .replace(/::/g, "・")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "未分類";
}

function safeTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 160) || "unknown";
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
