import { getSql, isDatabaseConfigured } from "@/lib/db";
import type { GenerationProfileCode } from "@/lib/expression-types";

export type AnkiExportFilter = {
  variantIds?: string[];
  tags?: string[];
  from?: string;
  to?: string;
  requireAudio?: boolean;
};

export type AnkiMediaRef = {
  filename: string;
  blobPath: string;
  kind: "word" | "sentence";
};

export type AnkiExportRecord = {
  variantId: string;
  ankiGuid: string;
  registeredAt: string;
  deckName: string;
  fields: [string, string, string, string, string, string, string, string];
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
  profile_code: GenerationProfileCode;
  english: string;
  japanese: string;
  key_expression: string;
  definition_ja: string;
  irregular_forms: string;
  registered_at: Date | string;
  genre_slug: string;
  situation_tags: string[] | null;
  audio_kind: "word" | "sentence" | null;
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
    super("Selected cards do not have both provider-backed audio assets ready.");
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
  const tags = normalizeList(filter.tags);
  const from = normalizeDate(filter.from);
  const to = normalizeDate(filter.to);
  const rows = await sql<ExportRow[]>`
    select
      v.id as variant_id,
      v.anki_guid,
      v.profile_code,
      v.english,
      v.japanese,
      v.key_expression,
      v.definition_ja,
      v.irregular_forms,
      e.registered_at,
      e.genre_slug,
      e.situation_tags,
      a.kind as audio_kind,
      a.blob_path as audio_blob_path,
      a.provider as audio_provider,
      a.locale as audio_locale,
      a.status as audio_status
    from sentence_variants v
    join sentence_cards c on c.id = v.sentence_card_id and c.owner_login = v.owner_login
    join expression_entries e on e.id = c.entry_id and e.owner_login = c.owner_login
    left join audio_assets a on a.variant_id = v.id and a.owner_login = v.owner_login
    where v.owner_login = ${ownerLogin}
      and e.status = 'registered'
      and (${variantIds.length > 0} or v.is_selected = true)
      and v.status <> 'archived'
      and e.registered_at is not null
      and (${variantIds.length === 0} or v.id = any(${sql.array(variantIds)}))
      and (${tags.length === 0} or e.situation_tags && ${sql.array(tags)})
      and (${from ? sql`e.registered_at >= ${from}` : sql`true`})
      and (${to ? sql`e.registered_at < ${to}` : sql`true`})
    order by e.registered_at asc, v.anki_guid asc
  `;

  const records = rowsToRecords(rows);

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
    select id, status, card_count as "cardCount", blob_path as "blobPath", error_code as "errorCode"
    from anki_exports
    where owner_login = ${ownerLogin} and id = ${exportId}
    limit 1
  `;

  return rows[0] ?? null;
}

function rowsToRecords(rows: ExportRow[]): AnkiExportRecord[] {
  const grouped = new Map<string, { row: ExportRow; media: AnkiMediaRef[] }>();

  for (const row of rows) {
    const current = grouped.get(row.variant_id);
    if (current) {
      appendMedia(current.media, row);
      continue;
    }

    const media: AnkiMediaRef[] = [];
    appendMedia(media, row);
    grouped.set(row.variant_id, { row, media });
  }

  return Array.from(grouped.values()).map(({ row, media }) => {
    const registeredAt = toIso(row.registered_at);
    const safeId = row.variant_id.replace(/[^A-Za-z0-9_-]/g, "_");
    const genre = slug(row.genre_slug || "expression");
    const situationTags = (row.situation_tags ?? []).map((tag) => `situation::${slug(tag)}`);
    const exportTags = [
      "source::saydeck",
      `genre::${genre}`,
      ...situationTags,
      `difficulty::${row.profile_code.toLowerCase()}`,
    ];

    return {
      variantId: row.variant_id,
      ankiGuid: row.anki_guid,
      registeredAt,
      deckName: `SayDeck::${genre}`,
      fields: [
        `sb_${safeId}`,
        row.key_expression,
        row.definition_ja,
        row.irregular_forms,
        row.english,
        row.japanese,
        `[sound:saydeck_word_${safeId}.wav]`,
        `[sound:saydeck_sentence_${safeId}.wav]`,
      ] as AnkiExportRecord["fields"],
      tags: exportTags,
      media,
    };
  });
}

function appendMedia(media: AnkiMediaRef[], row: ExportRow): void {
  if (!row.audio_kind || !row.audio_blob_path || row.audio_status !== "ready" || row.audio_locale !== "en-US") return;
  const safeId = row.variant_id.replace(/[^A-Za-z0-9_-]/g, "_");
  const filename = row.audio_kind === "word"
    ? `saydeck_word_${safeId}.wav`
    : `saydeck_sentence_${safeId}.wav`;

  if (media.some((item) => item.kind === row.audio_kind)) return;
  media.push({ filename, blobPath: row.audio_blob_path, kind: row.audio_kind });
}

function hasReadyAudio(record: AnkiExportRecord): boolean {
  return record.media?.some((item) => item.kind === "word") === true
    && record.media?.some((item) => item.kind === "sentence") === true;
}

function normalizeList(value: string[] | undefined): string[] {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean))).slice(0, 200);
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ン一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "uncategorized";
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
