import { createHash } from "node:crypto";

import { getSql, isDatabaseConfigured } from "@/lib/db";
import { putPrivateBinary } from "@/lib/binary-store";
import { defaultGenerationProfiles } from "@/lib/generation-profiles";
import {
  getTtsConfig,
  synthesizeAmericanEnglish,
  TtsProviderError,
} from "@/lib/tts-provider";
import { normalizeSituationTags } from "@/lib/situation-tags";
import type {
  AudioAsset,
  ExpressionEntry,
  ExpressionEntryDetail,
  GenerationProfile,
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

export class ExpressionSituationTagsRequiredError extends Error {
  constructor() {
    super("At least one situation tag is required to register an expression.");
    this.name = "ExpressionSituationTagsRequiredError";
  }
}

export class ExpressionAlreadyRegisteredError extends Error {
  constructor() {
    super("A registered expression cannot be regenerated.");
    this.name = "ExpressionAlreadyRegisteredError";
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
  genreSlug: string;
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
  locale: string;
  speed: number | string;
  format: string;
  status: AudioAsset["status"];
  error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type GenerationProfileRow = {
  owner_login: string;
  code: GenerationProfile["code"];
  name: string;
  min_words: number;
  max_words: number;
  max_sentences: number;
  required_features: string[] | null;
  instruction: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function requireDatabase() {
  if (!isDatabaseConfigured()) {
    throw new ExpressionDatabaseUnavailableError();
  }

  return getSql();
}

export async function listGenerationProfiles(ownerLogin: string): Promise<GenerationProfile[]> {
  const sql = requireDatabase();
  const rows = await sql<GenerationProfileRow[]>`
    select owner_login, code, name, min_words, max_words, max_sentences,
      required_features, instruction, created_at, updated_at
    from generation_profiles
    where owner_login = ${ownerLogin}
    order by code asc
  `;

  if (rows.length === 4) return rows.map(toGenerationProfile);

  const defaults = defaultGenerationProfiles(ownerLogin);
  await sql.begin(async (transaction) => {
    for (const profile of defaults) {
      await transaction`
        insert into generation_profiles (
          owner_login, code, name, min_words, max_words, max_sentences,
          required_features, instruction
        ) values (
          ${profile.ownerLogin}, ${profile.code}, ${profile.name}, ${profile.minWords},
          ${profile.maxWords}, ${profile.maxSentences}, ${transaction.json(profile.requiredFeatures)}, ${profile.instruction}
        ) on conflict (owner_login, code) do nothing
      `;
    }
  });

  const seeded = await sql<GenerationProfileRow[]>`
    select owner_login, code, name, min_words, max_words, max_sentences,
      required_features, instruction, created_at, updated_at
    from generation_profiles
    where owner_login = ${ownerLogin}
    order by code asc
  `;
  return seeded.length === 4 ? seeded.map(toGenerationProfile) : defaults;
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
      ${id}, ${input.ownerLogin}, ${input.inputJa}, '',
      ${input.genreSlug}, ${sql.array([])}, 'draft'
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

  if (current.status === "registered") {
    throw new ExpressionAlreadyRegisteredError();
  }

  const suggestedSituationTags = normalizeSituationTags(input.result.suggestedSituationTags);
  if (suggestedSituationTags.length === 0) {
    throw new ExpressionSituationTagsRequiredError();
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

    if (input.result.suggestedGenreSlug || suggestedSituationTags.length) {
      await transaction`
        update expression_entries
        set genre_slug = case
              when genre_slug = '' then ${input.result.suggestedGenreSlug ?? ''}
              else genre_slug
            end,
            situation_tags = case
              when cardinality(situation_tags) = 0
                then ${transaction.array(suggestedSituationTags)}
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
  const situationTags = normalizeSituationTags(current.situationTags);

  if (situationTags.length === 0) {
    throw new ExpressionSituationTagsRequiredError();
  }

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

  await sql`
    update expression_entries
    set genre_slug = ${input.genreSlug?.trim().slice(0, 120) ?? current.genreSlug},
      situation_tags = ${sql.array(situationTags)},
      updated_at = now()
    where owner_login = ${input.ownerLogin} and id = ${input.entryId}
  `;

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

  const saved = await getExpressionEntry(input.ownerLogin, input.entryId);

  if (!saved) {
    throw new Error("Approved expression entry could not be reloaded.");
  }

  return saved;
}

/** Hide an expression from the product without destroying its export history. */
export async function archiveExpressionEntry(input: {
  ownerLogin: string;
  entryId: string;
}): Promise<boolean> {
  const sql = requireDatabase();
  const result = await sql<{ id: string }[]>`
    update expression_entries
    set status = 'archived', updated_at = now()
    where owner_login = ${input.ownerLogin}
      and id = ${input.entryId}
      and status <> 'archived'
    returning id
  `;

  return result.length > 0;
}

export async function registerSentenceVariantAudio(input: {
  ownerLogin: string;
  variantId: string;
}): Promise<void> {
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

  const config = getTtsConfig();
  const sources = [
    { kind: "word" as const, text: variant.key_expression },
    { kind: "sentence" as const, text: variant.english },
  ];
  const expectedHashes = new Map(sources.map((source) => [source.kind, textHash(source.kind, source.text, config)]));
  const existingAssets = await sql<Array<{
    kind: "word" | "sentence";
    text_hash: string;
    provider: string;
    locale: string;
    status: "pending" | "ready" | "failed" | "stale";
  }>>`
    select kind, text_hash, provider, locale, status
    from audio_assets
    where owner_login = ${input.ownerLogin} and variant_id = ${variant.id}
  `;
  const hasReusableAudio = sources.every((source) => existingAssets.some((asset) =>
    asset.kind === source.kind
      && asset.status === "ready"
      && asset.provider === config.provider
      && asset.locale === config.locale
      && asset.text_hash === expectedHashes.get(source.kind),
  ));

  if (hasReusableAudio) {
    await sql`
      update sentence_variants
      set status = 'audio_ready', updated_at = now()
      where owner_login = ${input.ownerLogin} and id = ${variant.id}
    `;
    return;
  }

  await sql`
    update sentence_variants
    set status = 'approved', updated_at = now()
    where owner_login = ${input.ownerLogin} and id = ${variant.id}
  `;
  await sql`
    insert into audio_assets (
      id, owner_login, variant_id, kind, blob_path, text_hash,
      provider, model, voice, locale, speed, format, status
    )
    values
      (${`audio_${variant.id}_word`}, ${input.ownerLogin}, ${variant.id}, 'word', '',
        ${textHash("word", variant.key_expression, config)}, ${config.provider}, ${config.model}, ${config.voice}, ${config.locale}, ${config.speed}, 'wav', 'pending'),
      (${`audio_${variant.id}_sentence`}, ${input.ownerLogin}, ${variant.id}, 'sentence', '',
        ${textHash("sentence", variant.english, config)}, ${config.provider}, ${config.model}, ${config.voice}, ${config.locale}, ${config.speed}, 'wav', 'pending')
    on conflict (owner_login, variant_id, kind) do update set
      blob_path = excluded.blob_path, text_hash = excluded.text_hash,
      provider = excluded.provider, model = excluded.model,
      voice = excluded.voice, locale = excluded.locale, speed = excluded.speed, format = excluded.format,
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
          provider = ${audio.config.provider}, model = ${audio.config.model},
          voice = ${audio.config.voice}, locale = ${audio.config.locale}, speed = ${audio.config.speed},
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

}

function textHash(
  kind: "word" | "sentence",
  text: string,
  config: { model: string; voice: string; locale: string; speed: number },
): string {
  return createHash("sha256")
    .update(JSON.stringify({ kind, text, model: config.model, voice: config.voice, locale: config.locale, speed: config.speed, format: "wav" }))
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
          provider, model, voice, locale, speed, format, status, error_code,
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

function toGenerationProfile(row: GenerationProfileRow): GenerationProfile {
  return {
    ownerLogin: row.owner_login,
    code: row.code,
    name: row.name,
    minWords: row.min_words,
    maxWords: row.max_words,
    maxSentences: row.max_sentences,
    requiredFeatures: row.required_features ?? [],
    instruction: row.instruction,
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
    locale: row.locale,
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
