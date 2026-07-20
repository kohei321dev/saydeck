import { createHash } from "node:crypto";

import { getSql, isDatabaseConfigured } from "@/lib/db";
import { putPrivateBinary } from "@/lib/binary-store";
import {
  getTtsConfig,
  isTtsConfigured,
  MissingTtsApiKeyError,
  synthesizeAmericanEnglish,
  TtsProviderError,
} from "@/lib/tts-provider";
import type {
  AudioAsset,
  ExpressionEntry,
  ExpressionEntryDetail,
  GenerationResult,
  SentenceCard,
  SentenceVariant,
} from "@/lib/expression-types";

export class ExpressionDatabaseUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "ExpressionDatabaseUnavailableError";
  }
}

export class ExpressionSelectionError extends Error {
  constructor() {
    super("No selected variants belong to this expression entry.");
    this.name = "ExpressionSelectionError";
  }
}

export class ExpressionVariantUpdateError extends Error {
  constructor() {
    super("Expression variant update was invalid.");
    this.name = "ExpressionVariantUpdateError";
  }
}

export class SentenceVariantNotFoundError extends Error {
  constructor() {
    super("Sentence variant was not found.");
    this.name = "SentenceVariantNotFoundError";
  }
}

export class AudioRegistrationError extends Error {
  readonly code: "storage_unavailable" | "provider_unavailable" | "provider_quota" | "invalid_audio";

  constructor(code: AudioRegistrationError["code"], message: string) {
    super(message);
    this.name = "AudioRegistrationError";
    this.code = code;
  }
}

type CreateExpressionInput = {
  ownerLogin: string;
  inputJa: string;
  situationJa: string;
  genreSlug: string;
  situationTags: string[];
};

type ExpressionEntryRow = {
  id: string;
  owner_login: string;
  input_ja: string;
  situation_ja: string;
  genre_slug: string;
  situation_tags: string[] | null;
  status: ExpressionEntry["status"];
  registered_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type SentenceCardRow = {
  id: string;
  owner_login: string;
  entry_id: string;
  position: number;
  intent_ja: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type SentenceVariantRow = {
  id: string;
  owner_login: string;
  sentence_card_id: string;
  profile_code: SentenceVariant["profileCode"];
  english: string;
  japanese: string;
  key_expression: string;
  definition_ja: string;
  irregular_forms: string;
  constraints: string;
  review_points: string;
  anki_guid: string;
  anki_index: string;
  is_selected: boolean;
  status: SentenceVariant["status"];
  created_at: Date | string;
  updated_at: Date | string;
};

type AudioAssetRow = {
  id: string;
  owner_login: string;
  variant_id: string;
  kind: AudioAsset["kind"];
  blob_path: string;
  text_hash: string;
  provider: string;
  model: string;
  voice: string;
  speed: number | string;
  format: string;
  status: AudioAsset["status"];
  error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function requireDatabase() {
  if (!isDatabaseConfigured()) {
    throw new ExpressionDatabaseUnavailableError();
  }

  return getSql();
}

export async function createExpressionEntry(
  input: CreateExpressionInput,
): Promise<ExpressionEntryDetail> {
  const sql = requireDatabase();
  const id = `expr_${crypto.randomUUID()}`;
  const rows = await sql<ExpressionEntryRow[]>`
    insert into expression_entries (
      id, owner_login, input_ja, situation_ja, genre_slug, situation_tags, status
    )
    values (
      ${id}, ${input.ownerLogin}, ${input.inputJa}, ${input.situationJa},
      ${input.genreSlug}, ${sql.array(input.situationTags)}, 'draft'
    )
    returning id, owner_login, input_ja, situation_ja, genre_slug,
      situation_tags, status, registered_at, created_at, updated_at
  `;

  const entry = rows[0];

  if (!entry) {
    throw new Error("Expression entry was not created.");
  }

  return toDetail(toEntry(entry), []);
}

export async function listExpressionEntries(
  ownerLogin: string,
  limit = 100,
): Promise<ExpressionEntryDetail[]> {
  const sql = requireDatabase();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const entries = await sql<ExpressionEntryRow[]>`
    select id, owner_login, input_ja, situation_ja, genre_slug,
      situation_tags, status, registered_at, created_at, updated_at
    from expression_entries
    where owner_login = ${ownerLogin}
      and status <> 'archived'
    order by updated_at desc, id desc
    limit ${safeLimit}
  `;

  if (entries.length === 0) {
    return [];
  }

  return readDetails(ownerLogin, entries);
}

export async function getExpressionEntry(
  ownerLogin: string,
  entryId: string,
): Promise<ExpressionEntryDetail | null> {
  const sql = requireDatabase();
  const entries = await sql<ExpressionEntryRow[]>`
    select id, owner_login, input_ja, situation_ja, genre_slug,
      situation_tags, status, registered_at, created_at, updated_at
    from expression_entries
    where owner_login = ${ownerLogin}
      and id = ${entryId}
      and status <> 'archived'
    limit 1
  `;

  if (!entries[0]) {
    return null;
  }

  const details = await readDetails(ownerLogin, entries);
  return details[0] ?? null;
}

export async function saveGenerationResult(input: {
  ownerLogin: string;
  entryId: string;
  result: GenerationResult;
}): Promise<ExpressionEntryDetail> {
  const sql = requireDatabase();
  const current = await getExpressionEntry(input.ownerLogin, input.entryId);

  if (!current) {
    throw new Error("Expression entry was not found.");
  }

  await sql.begin(async (transaction) => {
    await transaction`
      delete from sentence_cards
      where owner_login = ${input.ownerLogin}
        and entry_id = ${input.entryId}
    `;

    for (const [position, segment] of input.result.segments.entries()) {
      const sentenceCardId = `sc_${crypto.randomUUID()}`;
      await transaction`
        insert into sentence_cards (
          id, owner_login, entry_id, position, intent_ja
        )
        values (
          ${sentenceCardId}, ${input.ownerLogin}, ${input.entryId},
          ${position}, ${segment.intentJa}
        )
      `;

      for (const variant of segment.variants) {
        const variantId = variant.id ?? `var_${crypto.randomUUID()}`;
        const ankiGuid = variant.ankiGuid ?? `sb_${crypto.randomUUID()}`;
        await transaction`
          insert into sentence_variants (
            id, owner_login, sentence_card_id, profile_code, english,
            japanese, key_expression, definition_ja, irregular_forms,
            constraints, review_points, anki_guid, anki_index, is_selected, status
          )
          values (
            ${variantId},
            ${input.ownerLogin}, ${sentenceCardId}, ${variant.profileCode},
            ${variant.english}, ${variant.japanese}, ${variant.keyExpression},
            ${variant.definitionJa}, ${variant.irregularForms},
            ${variant.constraints}, ${variant.reviewPoints},
            ${ankiGuid}, ${ankiGuid}, false, 'draft'
          )
        `;
      }
    }

    if (input.result.suggestedGenreSlug || input.result.suggestedSituationTags?.length) {
      await transaction`
        update expression_entries
        set genre_slug = case
              when genre_slug = '' then ${input.result.suggestedGenreSlug ?? ''}
              else genre_slug
            end,
            situation_tags = case
              when cardinality(situation_tags) = 0
                then ${transaction.array(input.result.suggestedSituationTags ?? [])}
              else situation_tags
            end,
            updated_at = now()
        where owner_login = ${input.ownerLogin} and id = ${input.entryId}
      `;
    }

    await transaction`
      update expression_entries
      set status = 'generated', updated_at = now()
      where owner_login = ${input.ownerLogin}
        and id = ${input.entryId}
    `;
  });

  const saved = await getExpressionEntry(input.ownerLogin, input.entryId);

  if (!saved) {
    throw new Error("Generated expression entry could not be reloaded.");
  }

  return saved;
}

export async function approveExpressionEntry(input: {
  ownerLogin: string;
  entryId: string;
  selectedVariantIds: string[];
  variantUpdates?: Array<{
    id: string;
    english?: string;
    japanese?: string;
    keyExpression?: string;
    definitionJa?: string;
    irregularForms?: string;
  }>;
  genreSlug?: string;
  situationTags?: string[];
}): Promise<ExpressionEntryDetail> {
  const sql = requireDatabase();
  const current = await getExpressionEntry(input.ownerLogin, input.entryId);

  if (!current) {
    throw new Error("Expression entry was not found.");
  }

  const selected = new Set(input.selectedVariantIds.slice(0, 100));
  const selectedIds = Array.from(selected);
  const validRows = await sql<{ id: string }[]>`
    select id
    from sentence_variants
    where owner_login = ${input.ownerLogin}
      and id = any(${sql.array(selectedIds)})
      and sentence_card_id in (
        select id from sentence_cards
        where owner_login = ${input.ownerLogin} and entry_id = ${input.entryId}
      )
  `;

  if (validRows.length === 0) {
    throw new ExpressionSelectionError();
  }

  const validIds = validRows.map((row) => row.id);

  const updates = (input.variantUpdates ?? [])
    .filter((update) => validIds.includes(update.id))
    .slice(0, 100);

  for (const update of updates) {
    const english = update.english?.trim();
    const japanese = update.japanese?.trim();
    const keyExpression = update.keyExpression?.trim();
    const definitionJa = update.definitionJa?.trim();
    const irregularForms = update.irregularForms?.trim();

    if (
      (english !== undefined && (english.length === 0 || english.length > 2_000))
      || (japanese !== undefined && japanese.length > 2_000)
      || (keyExpression !== undefined && keyExpression.length > 500)
      || (definitionJa !== undefined && definitionJa.length > 1_000)
      || (irregularForms !== undefined && irregularForms.length > 500)
    ) {
      throw new ExpressionVariantUpdateError();
    }

    await sql`
      update sentence_variants
      set english = coalesce(${english ?? null}, english),
        japanese = coalesce(${japanese ?? null}, japanese),
        key_expression = coalesce(${keyExpression ?? null}, key_expression),
        definition_ja = coalesce(${definitionJa ?? null}, definition_ja),
        irregular_forms = coalesce(${irregularForms ?? null}, irregular_forms),
        status = 'stale', updated_at = now()
      where owner_login = ${input.ownerLogin} and id = ${update.id}
    `;
    await sql`
      update audio_assets
      set status = 'stale', updated_at = now()
      where owner_login = ${input.ownerLogin} and variant_id = ${update.id}
    `;
  }

  if (input.genreSlug !== undefined || input.situationTags !== undefined) {
    await sql`
      update expression_entries
      set genre_slug = ${input.genreSlug?.trim().slice(0, 120) ?? current.genreSlug},
        situation_tags = ${sql.array((input.situationTags ?? current.situationTags).slice(0, 20))},
        updated_at = now()
      where owner_login = ${input.ownerLogin} and id = ${input.entryId}
    `;
  }

  await sql`
    update sentence_variants
    set is_selected = false,
        status = case when status = 'approved' then 'draft' else status end,
        updated_at = now()
    where owner_login = ${input.ownerLogin}
      and sentence_card_id in (
        select id from sentence_cards
        where owner_login = ${input.ownerLogin} and entry_id = ${input.entryId}
      )
  `;

  await sql`
    update sentence_variants
    set is_selected = true, status = 'approved', updated_at = now()
    where owner_login = ${input.ownerLogin}
      and id = any(${sql.array(validIds)})
  `;

  await sql`
    update expression_entries
    set status = 'registered', registered_at = now(), updated_at = now()
    where owner_login = ${input.ownerLogin} and id = ${input.entryId}
  `;

  // DEV fallback: browser speech keeps the capture flow usable without a
  // server-side TTS credential. These rows are intentionally not marked
  // audio_ready and can never satisfy the APKG media gate.
  if (!isTtsConfigured() && process.env.NODE_ENV !== "production") {
    await insertBrowserSpeechAssets(sql, input.ownerLogin, validIds);
  }

  const saved = await getExpressionEntry(input.ownerLogin, input.entryId);

  if (!saved) {
    throw new Error("Approved expression entry could not be reloaded.");
  }

  return saved;
}

export async function registerSentenceVariantAudio(input: {
  ownerLogin: string;
  variantId: string;
}): Promise<{ entry: ExpressionEntryDetail; mode: "provider" | "browser" }> {
  const sql = requireDatabase();
  const rows = await sql<{
    id: string;
    owner_login: string;
    english: string;
    key_expression: string;
    sentence_card_id: string;
    entry_id: string;
    status: SentenceVariant["status"];
    is_selected: boolean;
  }[]>`
    select v.id, v.owner_login, v.english, v.key_expression,
      v.sentence_card_id, c.entry_id, v.status, v.is_selected
    from sentence_variants v
    join sentence_cards c on c.id = v.sentence_card_id and c.owner_login = v.owner_login
    where v.owner_login = ${input.ownerLogin} and v.id = ${input.variantId}
    limit 1
  `;
  const variant = rows[0];

  if (!variant) {
    throw new SentenceVariantNotFoundError();
  }

  if (!isTtsConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      await insertBrowserSpeechAssets(sql, input.ownerLogin, [variant.id]);
      const entry = await getExpressionEntry(input.ownerLogin, variant.entry_id);
      if (!entry) throw new Error("Expression entry was not found.");
      return { entry, mode: "browser" };
    }
    throw new MissingTtsApiKeyError();
  }

  const config = getTtsConfig();
  const sources = [
    { kind: "word" as const, text: variant.key_expression },
    { kind: "sentence" as const, text: variant.english },
  ];

  await sql`
    update sentence_variants
    set status = 'approved', updated_at = now()
    where owner_login = ${input.ownerLogin} and id = ${variant.id}
  `;
  await sql`
    insert into audio_assets (
      id, owner_login, variant_id, kind, blob_path, text_hash,
      provider, model, voice, speed, format, status
    )
    values
      (${`audio_${variant.id}_word`}, ${input.ownerLogin}, ${variant.id}, 'word', '',
        ${textHash("word", variant.key_expression, config)}, 'openai-compatible', ${config.model}, ${config.voice}, ${config.speed}, 'wav', 'pending'),
      (${`audio_${variant.id}_sentence`}, ${input.ownerLogin}, ${variant.id}, 'sentence', '',
        ${textHash("sentence", variant.english, config)}, 'openai-compatible', ${config.model}, ${config.voice}, ${config.speed}, 'wav', 'pending')
    on conflict (owner_login, variant_id, kind) do update set
      blob_path = excluded.blob_path, text_hash = excluded.text_hash,
      provider = excluded.provider, model = excluded.model,
      voice = excluded.voice, speed = excluded.speed, format = excluded.format,
      status = 'pending', error_code = null, updated_at = now()
  `;

  try {
    const generated = await Promise.all(sources.map(async (source) => {
      const audio = await synthesizeAmericanEnglish(source.text);
      const hash = textHash(source.kind, source.text, audio.config);
      const storage = await putPrivateBinary(
        `audio/${safePathSegment(input.ownerLogin)}/${safePathSegment(variant.id)}/${source.kind}-${hash}.wav`,
        audio.bytes,
        "audio/wav",
      );
      return { ...source, hash, storage, config: audio.config };
    }));

    for (const audio of generated) {
      await sql`
        update audio_assets
        set blob_path = ${audio.storage.blobPath}, text_hash = ${audio.hash},
          provider = 'openai-compatible', model = ${audio.config.model},
          voice = ${audio.config.voice}, speed = ${audio.config.speed},
          format = 'wav', status = 'ready', error_code = null, updated_at = now()
        where owner_login = ${input.ownerLogin}
          and variant_id = ${variant.id}
          and kind = ${audio.kind}
      `;
    }

    await sql`
      update sentence_variants
      set status = 'audio_ready', updated_at = now()
      where owner_login = ${input.ownerLogin} and id = ${variant.id}
    `;
  } catch (error) {
    const errorCode = error instanceof TtsProviderError
      ? error.code === "quota_exceeded" ? "provider_quota" : error.code === "invalid_audio" ? "invalid_audio" : "provider_unavailable"
      : error instanceof Error && error.name === "BinaryStorageUnavailableError"
        ? "storage_unavailable"
        : "provider_unavailable";
    await sql`
      update audio_assets
      set status = 'failed', error_code = ${errorCode}, updated_at = now()
      where owner_login = ${input.ownerLogin} and variant_id = ${variant.id}
    `;
    await sql`
      update sentence_variants
      set status = 'audio_failed', updated_at = now()
      where owner_login = ${input.ownerLogin} and id = ${variant.id}
    `;

    if (error instanceof TtsProviderError) {
      throw new AudioRegistrationError(errorCode, error.message);
    }
    throw new AudioRegistrationError(errorCode, "音声ファイルの登録に失敗しました。");
  }

  const entry = await getExpressionEntry(input.ownerLogin, variant.entry_id);
  if (!entry) throw new Error("Expression entry was not found.");
  return { entry, mode: "provider" };
}

export async function getAudioAssetForOwner(
  ownerLogin: string,
  assetId: string,
): Promise<AudioAsset | null> {
  const sql = requireDatabase();
  const rows = await sql<AudioAssetRow[]>`
    select id, owner_login, variant_id, kind, blob_path, text_hash,
      provider, model, voice, speed, format, status, error_code,
      created_at, updated_at
    from audio_assets
    where owner_login = ${ownerLogin} and id = ${assetId}
    limit 1
  `;
  return rows[0] ? toAudioAsset(rows[0]) : null;
}

async function insertBrowserSpeechAssets(
  sql: ReturnType<typeof getSql>,
  ownerLogin: string,
  variantIds: string[],
): Promise<void> {
  await sql`
    insert into audio_assets (
      id, owner_login, variant_id, kind, blob_path, text_hash,
      provider, model, voice, speed, format, status
    )
    select
      'audio_' || v.id || '_word', v.owner_login, v.id, 'word',
      'browser-speech://' || v.id || '/word', md5(v.key_expression),
      'browser-speech', 'SpeechSynthesis', 'en-US', 1.0, 'wav', 'ready'
    from sentence_variants v
    where v.owner_login = ${ownerLogin} and v.id = any(${sql.array(variantIds)})
    on conflict (owner_login, variant_id, kind) do update set
      blob_path = excluded.blob_path, text_hash = excluded.text_hash,
      provider = excluded.provider, model = excluded.model,
      voice = excluded.voice, status = excluded.status,
      error_code = null, updated_at = now()
    where audio_assets.provider = 'browser-speech'
  `;
  await sql`
    insert into audio_assets (
      id, owner_login, variant_id, kind, blob_path, text_hash,
      provider, model, voice, speed, format, status
    )
    select
      'audio_' || v.id || '_sentence', v.owner_login, v.id, 'sentence',
      'browser-speech://' || v.id || '/sentence', md5(v.english),
      'browser-speech', 'SpeechSynthesis', 'en-US', 1.0, 'wav', 'ready'
    from sentence_variants v
    where v.owner_login = ${ownerLogin} and v.id = any(${sql.array(variantIds)})
    on conflict (owner_login, variant_id, kind) do update set
      blob_path = excluded.blob_path, text_hash = excluded.text_hash,
      provider = excluded.provider, model = excluded.model,
      voice = excluded.voice, status = excluded.status,
      error_code = null, updated_at = now()
    where audio_assets.provider = 'browser-speech'
  `;
}

function textHash(
  kind: "word" | "sentence",
  text: string,
  config: { model: string; voice: string; speed: number },
): string {
  return createHash("sha256")
    .update(JSON.stringify({ kind, text, model: config.model, voice: config.voice, speed: config.speed, format: "wav" }))
    .digest("hex");
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "unknown";
}

async function readDetails(
  ownerLogin: string,
  entries: ExpressionEntryRow[],
): Promise<ExpressionEntryDetail[]> {
  const sql = requireDatabase();
  const entryIds = entries.map((entry) => entry.id);
  const cards = await sql<SentenceCardRow[]>`
    select id, owner_login, entry_id, position, intent_ja, created_at, updated_at
    from sentence_cards
    where owner_login = ${ownerLogin}
      and entry_id = any(${sql.array(entryIds)})
    order by position asc, id asc
  `;

  const cardIds = cards.map((card) => card.id);
  const variants = cardIds.length
    ? await sql<SentenceVariantRow[]>`
        select id, owner_login, sentence_card_id, profile_code, english,
          japanese, key_expression, definition_ja, irregular_forms,
          constraints, review_points, anki_guid, anki_index, is_selected, status,
          created_at, updated_at
        from sentence_variants
        where owner_login = ${ownerLogin}
          and sentence_card_id = any(${sql.array(cardIds)})
        order by profile_code asc, id asc
      `
    : [];

  const audioAssets = variants.length
    ? await sql<AudioAssetRow[]>`
        select id, owner_login, variant_id, kind, blob_path, text_hash,
          provider, model, voice, speed, format, status, error_code,
          created_at, updated_at
        from audio_assets
        where owner_login = ${ownerLogin}
          and variant_id = any(${sql.array(variants.map((variant) => variant.id))})
        order by kind asc, id asc
      `
    : [];
  const audioByVariant = new Map<string, AudioAsset[]>();

  for (const row of audioAssets) {
    const assets = audioByVariant.get(row.variant_id) ?? [];
    assets.push(toAudioAsset(row));
    audioByVariant.set(row.variant_id, assets);
  }

  const variantsByCard = new Map<string, SentenceVariant[]>();

  for (const row of variants) {
    const cardVariants = variantsByCard.get(row.sentence_card_id) ?? [];
    cardVariants.push({
      ...toVariant(row),
      audioAssets: audioByVariant.get(row.id) ?? [],
    });
    variantsByCard.set(row.sentence_card_id, cardVariants);
  }

  const cardsByEntry = new Map<string, SentenceCard[]>();

  for (const row of cards) {
    const entryCards = cardsByEntry.get(row.entry_id) ?? [];
    entryCards.push({ ...toCard(row), variants: variantsByCard.get(row.id) ?? [] });
    cardsByEntry.set(row.entry_id, entryCards);
  }

  return entries.map((row) =>
    toDetail(toEntry(row), cardsByEntry.get(row.id) ?? []),
  );
}

function toEntry(row: ExpressionEntryRow): ExpressionEntry {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    inputJa: row.input_ja,
    situationJa: row.situation_ja,
    genreSlug: row.genre_slug,
    situationTags: row.situation_tags ?? [],
    status: row.status,
    registeredAt: row.registered_at ? toIso(row.registered_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toCard(row: SentenceCardRow): SentenceCard {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    entryId: row.entry_id,
    position: row.position,
    intentJa: row.intent_ja,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toVariant(row: SentenceVariantRow): SentenceVariant {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    sentenceCardId: row.sentence_card_id,
    profileCode: row.profile_code,
    english: row.english,
    japanese: row.japanese,
    keyExpression: row.key_expression,
    definitionJa: row.definition_ja,
    irregularForms: row.irregular_forms,
    constraints: row.constraints,
    reviewPoints: row.review_points,
    ankiGuid: row.anki_guid,
    ankiIndex: row.anki_index,
    isSelected: row.is_selected,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toAudioAsset(row: AudioAssetRow): AudioAsset {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    variantId: row.variant_id,
    kind: row.kind,
    blobPath: row.blob_path,
    textHash: row.text_hash,
    provider: row.provider,
    model: row.model,
    voice: row.voice,
    speed: Number(row.speed),
    format: row.format,
    status: row.status,
    errorCode: row.error_code,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toDetail(
  entry: ExpressionEntry,
  sentenceCards: SentenceCard[],
): ExpressionEntryDetail {
  return { ...entry, sentenceCards };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
