import { createHash } from "node:crypto";

import type postgres from "postgres";

import { putPrivateBinary } from "@/lib/binary-store";
import { getSql, isDatabaseConfigured } from "@/lib/db";
import { defaultGenerationProfiles, profileOrder } from "@/lib/generation-profiles";
import {
  getTtsConfig,
  synthesizeAmericanEnglish,
  TtsProviderError,
} from "@/lib/tts-provider";
import type {
  AudioAsset,
  ExpressionEntry,
  ExpressionEntryDetail,
  GenerationProfile,
  GenerationProfileCode,
  GenerationResult,
  SentenceCard,
  SentenceVariant,
  SituationDefinition,
  SituationSelectedBy,
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

export class ExpressionBasicVariantRequiredError extends Error {
  constructor() {
    super("Every meaning unit must keep its basic expression selected.");
    this.name = "ExpressionBasicVariantRequiredError";
  }
}

export class ExpressionVariantUpdateError extends Error {
  constructor() {
    super("Expression variant update was invalid.");
    this.name = "ExpressionVariantUpdateError";
  }
}

export class ExpressionSituationRequiredError extends Error {
  constructor() {
    super("A primary and secondary situation are required.");
    this.name = "ExpressionSituationRequiredError";
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
};

type ClassificationSelection = {
  primarySituationId?: string;
  primarySituationLabelJa?: string;
  secondarySituationLabelJa?: string;
  selectedBy?: SituationSelectedBy;
};

type ExpressionEntryRow = {
  id: string;
  owner_login: string;
  input_ja: string;
  situation_sequence: number | null;
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
  pattern_code: SentenceVariant["patternCode"];
  expression_en: string;
  translation_ja: string;
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

type SituationDefinitionRow = {
  id: string;
  owner_login: string;
  parent_id: string | null;
  kind: SituationDefinition["kind"];
  base_label_ja: string;
  duplicate_sequence: number;
  label_ja: string;
  canonical_key: string;
  status: SituationDefinition["status"];
  sort_order: number;
  last_used_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type EntrySituationRow = SituationDefinitionRow & {
  entry_id: string;
  role: "primary" | "secondary";
  selected_by: SituationSelectedBy;
};

type VariantSelectionRow = {
  id: string;
  sentence_card_id: string;
  position: number;
  profile_code: GenerationProfileCode;
  pattern_code: SentenceVariant["patternCode"];
  expression_en: string;
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
    order by case code
      when 'basic' then 1
      when 'detail' then 2
      when 'conversation' then 3
      else 4
    end
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
          ${profile.maxWords}, ${profile.maxSentences},
          ${transaction.json(profile.requiredFeatures)}, ${profile.instruction}
        ) on conflict (owner_login, code) do update set
          name = excluded.name,
          min_words = excluded.min_words,
          max_words = excluded.max_words,
          max_sentences = excluded.max_sentences,
          required_features = excluded.required_features,
          instruction = excluded.instruction,
          updated_at = now()
      `;
    }
  });

  const seeded = await sql<GenerationProfileRow[]>`
    select owner_login, code, name, min_words, max_words, max_sentences,
      required_features, instruction, created_at, updated_at
    from generation_profiles
    where owner_login = ${ownerLogin}
    order by case code
      when 'basic' then 1
      when 'detail' then 2
      when 'conversation' then 3
      else 4
    end
  `;
  return seeded.length === 4 ? seeded.map(toGenerationProfile) : defaults;
}

export async function listSituationDefinitions(
  ownerLogin: string,
  options: { includeArchived?: boolean } = {},
): Promise<SituationDefinition[]> {
  const sql = requireDatabase();
  const statusFilter = options.includeArchived
    ? sql`true`
    : sql`s.status = 'active'`;
  const rows = await sql<SituationDefinitionRow[]>`
    select s.id, s.owner_login, s.parent_id, s.kind, s.base_label_ja,
      s.duplicate_sequence, s.label_ja, s.canonical_key, s.status,
      s.sort_order, max(e.registered_at) as last_used_at,
      s.created_at, s.updated_at
    from situation_definitions s
    left join expression_entry_situations assignment
      on assignment.situation_id = s.id
    left join expression_entries e
      on e.id = assignment.entry_id and e.status = 'registered'
    where s.owner_login = ${ownerLogin}
      and ${statusFilter}
    group by s.id
    order by s.kind asc,
      max(e.registered_at) desc nulls last,
      s.sort_order asc,
      s.label_ja asc
  `;

  return rows.map(toSituationDefinition);
}

export async function listPrimarySituationDefinitions(
  ownerLogin: string,
): Promise<SituationDefinition[]> {
  return (await listSituationDefinitions(ownerLogin)).filter(
    (situation) => situation.kind === "primary",
  );
}

export async function createExpressionEntry(
  input: CreateExpressionInput,
): Promise<ExpressionEntryDetail> {
  const sql = requireDatabase();
  const id = `expr_${crypto.randomUUID()}`;
  const rows = await sql<ExpressionEntryRow[]>`
    insert into expression_entries (
      id, owner_login, input_ja, status
    )
    values (
      ${id}, ${input.ownerLogin}, ${input.inputJa}, 'draft'
    )
    returning id, owner_login, input_ja, situation_sequence,
      status, registered_at, created_at, updated_at
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
    select id, owner_login, input_ja, situation_sequence,
      status, registered_at, created_at, updated_at
    from expression_entries
    where owner_login = ${ownerLogin}
      and status = 'registered'
    order by registered_at desc nulls last, updated_at desc, id desc
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
    select id, owner_login, input_ja, situation_sequence,
      status, registered_at, created_at, updated_at
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
        const ankiGuid = variant.ankiGuid ?? `sd_${crypto.randomUUID()}`;
        await transaction`
          insert into sentence_variants (
            id, owner_login, sentence_card_id, profile_code, pattern_code,
            expression_en, translation_ja, anki_guid, anki_index,
            is_selected, status
          )
          values (
            ${variantId}, ${input.ownerLogin}, ${sentenceCardId},
            ${variant.profileCode}, ${variant.patternCode}, ${variant.expressionEn},
            ${variant.translationJa}, ${ankiGuid},
            ${`pending_${crypto.randomUUID()}`}, false, 'draft'
          )
        `;
      }
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
    expressionEn?: string;
    translationJa?: string;
  }>;
  classification?: ClassificationSelection;
}): Promise<ExpressionEntryDetail> {
  const sql = requireDatabase();
  const selectedIds = Array.from(new Set(input.selectedVariantIds.slice(0, 100)));

  if (selectedIds.length === 0) {
    throw new ExpressionSelectionError();
  }

  await sql.begin(async (transaction) => {
    const entryRows = await transaction<Pick<ExpressionEntryRow, "id" | "status">[]>`
      select id, status
      from expression_entries
      where owner_login = ${input.ownerLogin}
        and id = ${input.entryId}
        and status <> 'archived'
      for update
    `;
    const entry = entryRows[0];
    if (!entry) {
      throw new Error("Expression entry was not found.");
    }

    const validRows = await transaction<VariantSelectionRow[]>`
      select v.id, v.sentence_card_id, c.position, v.profile_code, v.pattern_code, v.expression_en
      from sentence_variants v
      join sentence_cards c
        on c.id = v.sentence_card_id and c.owner_login = v.owner_login
      where v.owner_login = ${input.ownerLogin}
        and c.entry_id = ${input.entryId}
      order by c.position asc
    `;
    const validIdSet = new Set(validRows.map((row) => row.id));
    const selectedValidIds = selectedIds.filter((id) => validIdSet.has(id));

    if (selectedValidIds.length === 0) {
      throw new ExpressionSelectionError();
    }

    const selectedSet = new Set(selectedValidIds);
    const cardIds = Array.from(new Set(validRows.map((row) => row.sentence_card_id)));
    const everyCardHasBasic = cardIds.every((cardId) => validRows.some(
      (row) => row.sentence_card_id === cardId
        && row.profile_code === "basic"
        && selectedSet.has(row.id),
    ));
    if (!everyCardHasBasic) {
      throw new ExpressionBasicVariantRequiredError();
    }

    const validRowsById = new Map(validRows.map((row) => [row.id, row]));
    for (const update of (input.variantUpdates ?? []).slice(0, 100)) {
      const currentVariant = validRowsById.get(update.id);
      if (!currentVariant) continue;

      const expressionEn = update.expressionEn?.trim();
      const translationJa = update.translationJa?.trim();

      if (
        (expressionEn !== undefined && (expressionEn.length === 0 || expressionEn.length > 2_000))
        || (translationJa !== undefined && (translationJa.length === 0 || translationJa.length > 2_000))
      ) {
        throw new ExpressionVariantUpdateError();
      }

      if (expressionEn !== undefined && expressionEn !== currentVariant.expression_en) {
        await transaction`
          update audio_assets
          set status = 'stale', updated_at = now()
          where owner_login = ${input.ownerLogin}
            and variant_id = ${update.id}
        `;
      }

      await transaction`
        update sentence_variants
        set expression_en = coalesce(${expressionEn ?? null}::text, expression_en),
          translation_ja = coalesce(${translationJa ?? null}::text, translation_ja),
          status = case
            when ${expressionEn ?? null}::text is not null
              and expression_en <> ${expressionEn ?? null}::text
              then 'stale'
            else status
          end,
          updated_at = now()
        where owner_login = ${input.ownerLogin} and id = ${update.id}
      `;
    }

    await transaction`
      update sentence_variants
      set is_selected = false,
        status = case when status = 'archived' then status else 'draft' end,
        updated_at = now()
      where owner_login = ${input.ownerLogin}
        and sentence_card_id in (
          select id from sentence_cards
          where owner_login = ${input.ownerLogin} and entry_id = ${input.entryId}
        )
    `;

    await transaction`
      update sentence_variants
      set is_selected = true,
        status = case when status = 'audio_ready' then status else 'approved' end,
        updated_at = now()
      where owner_login = ${input.ownerLogin}
        and id = any(${transaction.array(selectedValidIds)})
    `;

    if (entry.status !== "registered") {
      const classification = input.classification;
      const secondaryLabel = normalizeSituationLabel(
        classification?.secondarySituationLabelJa,
      );
      if (
        !classification
        || (!classification.primarySituationId && !normalizeSituationLabel(classification.primarySituationLabelJa))
        || !secondaryLabel
      ) {
        throw new ExpressionSituationRequiredError();
      }

      const primary = classification.primarySituationId
        ? await readPrimarySituation(
          transaction,
          input.ownerLogin,
          classification.primarySituationId,
        )
        : await createOrReusePrimarySituation(
          transaction,
          input.ownerLogin,
          normalizeSituationLabel(classification.primarySituationLabelJa),
        );

      if (!primary) {
        throw new ExpressionSituationRequiredError();
      }

      const secondary = await createSecondarySituation(
        transaction,
        input.ownerLogin,
        primary,
        secondaryLabel,
      );
      const selectedBy = classification.selectedBy === "user" ? "user" : "ai";

      await transaction`
        insert into expression_entry_situations (
          entry_id, situation_id, role, selected_by
        )
        values
          (${input.entryId}, ${primary.id}, 'primary', ${selectedBy}),
          (${input.entryId}, ${secondary.id}, 'secondary', ${selectedBy})
        on conflict (entry_id, role) do update set
          situation_id = excluded.situation_id,
          selected_by = excluded.selected_by,
          updated_at = now()
      `;

      const sequenceRows = await transaction<{ last_sequence: number }[]>`
        insert into situation_sequence_counters (
          owner_login, primary_situation_id, last_sequence
        )
        values (${input.ownerLogin}, ${primary.id}, 1)
        on conflict (owner_login, primary_situation_id) do update set
          last_sequence = situation_sequence_counters.last_sequence + 1,
          updated_at = now()
        returning last_sequence
      `;
      const situationSequence = sequenceRows[0]?.last_sequence;
      if (!situationSequence) {
        throw new Error("Situation sequence could not be allocated.");
      }

      for (const row of validRows) {
        await transaction`
          update sentence_variants
          set anki_index = ${buildAnkiIndex(
            primary.canonical_key,
            situationSequence,
            row.position,
            row.profile_code,
            row.pattern_code,
          )},
            updated_at = now()
          where owner_login = ${input.ownerLogin} and id = ${row.id}
        `;
      }

      await transaction`
        update expression_entries
        set situation_sequence = ${situationSequence},
          status = 'registered',
          registered_at = now(),
          updated_at = now()
        where owner_login = ${input.ownerLogin} and id = ${input.entryId}
      `;
    } else {
      await transaction`
        update expression_entries
        set updated_at = now()
        where owner_login = ${input.ownerLogin} and id = ${input.entryId}
      `;
    }
  });

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
    expression_en: string;
    status: SentenceVariant["status"];
    is_selected: boolean;
  }[]>`
    select v.id, v.expression_en, v.status, v.is_selected
    from sentence_variants v
    join sentence_cards c
      on c.id = v.sentence_card_id and c.owner_login = v.owner_login
    join expression_entries e
      on e.id = c.entry_id and e.owner_login = c.owner_login
    where v.owner_login = ${input.ownerLogin}
      and v.id = ${input.variantId}
      and e.status = 'registered'
    limit 1
  `;
  const variant = rows[0];

  if (!variant) {
    throw new SentenceVariantNotFoundError();
  }

  const config = getTtsConfig();
  const expectedHash = textHash(variant.expression_en, config);
  const existingAssets = await sql<Array<{
    text_hash: string;
    provider: string;
    locale: string;
    status: AudioAsset["status"];
  }>>`
    select text_hash, provider, locale, status
    from audio_assets
    where owner_login = ${input.ownerLogin} and variant_id = ${variant.id}
  `;
  const hasReusableAudio = existingAssets.some((asset) =>
    asset.status === "ready"
      && asset.provider === config.provider
      && asset.locale === config.locale
      && asset.text_hash === expectedHash
  );

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
      id, owner_login, variant_id, blob_path, text_hash,
      provider, model, voice, locale, speed, format, status
    )
    values (
      ${`audio_${variant.id}`}, ${input.ownerLogin}, ${variant.id}, '',
      ${expectedHash}, ${config.provider}, ${config.model}, ${config.voice},
      ${config.locale}, ${config.speed}, 'wav', 'pending'
    )
    on conflict (owner_login, variant_id) do update set
      blob_path = excluded.blob_path,
      text_hash = excluded.text_hash,
      provider = excluded.provider,
      model = excluded.model,
      voice = excluded.voice,
      locale = excluded.locale,
      speed = excluded.speed,
      format = excluded.format,
      status = 'pending',
      error_code = null,
      updated_at = now()
  `;

  try {
    const audio = await synthesizeAmericanEnglish(variant.expression_en);
    const hash = textHash(variant.expression_en, audio.config);
    const storage = await putPrivateBinary(
      `audio/${safePathSegment(input.ownerLogin)}/${safePathSegment(variant.id)}/expression-${hash}.wav`,
      audio.bytes,
      "audio/wav",
    );

    await sql`
      update audio_assets
      set blob_path = ${storage.blobPath},
        text_hash = ${hash},
        provider = ${audio.config.provider},
        model = ${audio.config.model},
        voice = ${audio.config.voice},
        locale = ${audio.config.locale},
        speed = ${audio.config.speed},
        format = 'wav',
        status = 'ready',
        error_code = null,
        updated_at = now()
      where owner_login = ${input.ownerLogin}
        and variant_id = ${variant.id}
    `;

    await sql`
      update sentence_variants
      set status = 'audio_ready', updated_at = now()
      where owner_login = ${input.ownerLogin} and id = ${variant.id}
    `;
  } catch (error) {
    const errorCode = error instanceof TtsProviderError
      ? error.code === "quota_exceeded"
        ? "provider_quota"
        : error.code === "invalid_audio"
          ? "invalid_audio"
          : "provider_unavailable"
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
  text: string,
  config: { model: string; voice: string; locale: string; speed: number },
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      text,
      model: config.model,
      voice: config.voice,
      locale: config.locale,
      speed: config.speed,
      format: "wav",
    }))
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
        select id, owner_login, sentence_card_id, profile_code, pattern_code,
          expression_en, translation_ja, anki_guid, anki_index,
          is_selected, status, created_at, updated_at
        from sentence_variants
        where owner_login = ${ownerLogin}
          and sentence_card_id = any(${sql.array(cardIds)})
        order by case profile_code
          when 'basic' then 1
          when 'detail' then 2
          when 'conversation' then 3
          else 4
        end, pattern_code asc, id asc
      `
    : [];

  const audioAssets = variants.length
    ? await sql<AudioAssetRow[]>`
        select id, owner_login, variant_id, blob_path, text_hash,
          provider, model, voice, locale, speed, format, status, error_code,
          created_at, updated_at
        from audio_assets
        where owner_login = ${ownerLogin}
          and variant_id = any(${sql.array(variants.map((variant) => variant.id))})
        order by id asc
      `
    : [];
  const assignments = await sql<EntrySituationRow[]>`
    select assignment.entry_id, assignment.role, assignment.selected_by,
      situation.id, situation.owner_login, situation.parent_id, situation.kind,
      situation.base_label_ja, situation.duplicate_sequence, situation.label_ja,
      situation.canonical_key, situation.status, situation.sort_order,
      entry.registered_at as last_used_at,
      situation.created_at, situation.updated_at
    from expression_entry_situations assignment
    join situation_definitions situation
      on situation.id = assignment.situation_id
    join expression_entries entry
      on entry.id = assignment.entry_id
    where assignment.entry_id = any(${sql.array(entryIds)})
      and situation.owner_login = ${ownerLogin}
  `;

  const audioByVariant = new Map<string, AudioAsset[]>();

  for (const row of audioAssets) {
    audioByVariant.set(row.variant_id, [toAudioAsset(row)]);
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

  const assignmentsByEntry = new Map<string, EntrySituationRow[]>();
  for (const row of assignments) {
    const current = assignmentsByEntry.get(row.entry_id) ?? [];
    current.push(row);
    assignmentsByEntry.set(row.entry_id, current);
  }

  return entries.map((row) => {
    const entryAssignments = assignmentsByEntry.get(row.id) ?? [];
    const primary = entryAssignments.find((item) => item.role === "primary");
    const secondary = entryAssignments.find((item) => item.role === "secondary");
    return toDetail(
      {
        ...toEntry(row),
        primarySituation: primary ? toSituationDefinition(primary) : null,
        secondarySituation: secondary ? toSituationDefinition(secondary) : null,
        situationSelectedBy: primary?.selected_by ?? secondary?.selected_by ?? null,
      },
      cardsByEntry.get(row.id) ?? [],
    );
  });
}

async function readPrimarySituation(
  transaction: postgres.TransactionSql,
  ownerLogin: string,
  situationId: string,
): Promise<SituationDefinitionRow | null> {
  const rows = await transaction<SituationDefinitionRow[]>`
    select id, owner_login, parent_id, kind, base_label_ja,
      duplicate_sequence, label_ja, canonical_key, status,
      sort_order, null::timestamptz as last_used_at, created_at, updated_at
    from situation_definitions
    where owner_login = ${ownerLogin}
      and id = ${situationId}
      and kind = 'primary'
      and status = 'active'
    limit 1
  `;
  return rows[0] ?? null;
}

async function createOrReusePrimarySituation(
  transaction: postgres.TransactionSql,
  ownerLogin: string,
  labelJa: string,
): Promise<SituationDefinitionRow> {
  const canonicalKey = stableCanonicalKey("primary", labelJa);
  await transaction`select pg_advisory_xact_lock(hashtext(${`primary:${ownerLogin}:${canonicalKey}`}))`;
  const existing = await transaction<SituationDefinitionRow[]>`
    select id, owner_login, parent_id, kind, base_label_ja,
      duplicate_sequence, label_ja, canonical_key, status,
      sort_order, null::timestamptz as last_used_at, created_at, updated_at
    from situation_definitions
    where owner_login = ${ownerLogin}
      and canonical_key = ${canonicalKey}
      and kind = 'primary'
    limit 1
  `;
  if (existing[0]) {
    if (existing[0].status === "archived") {
      await transaction`
        update situation_definitions
        set status = 'active', updated_at = now()
        where id = ${existing[0].id}
      `;
      return { ...existing[0], status: "active" };
    }
    return existing[0];
  }

  const id = `sit_${crypto.randomUUID()}`;
  const rows = await transaction<SituationDefinitionRow[]>`
    insert into situation_definitions (
      id, owner_login, parent_id, kind, base_label_ja,
      duplicate_sequence, label_ja, canonical_key
    )
    values (
      ${id}, ${ownerLogin}, null, 'primary', ${labelJa},
      0, ${labelJa}, ${canonicalKey}
    )
    returning id, owner_login, parent_id, kind, base_label_ja,
      duplicate_sequence, label_ja, canonical_key, status,
      sort_order, null::timestamptz as last_used_at, created_at, updated_at
  `;
  if (!rows[0]) throw new Error("Primary situation could not be created.");
  return rows[0];
}

async function createSecondarySituation(
  transaction: postgres.TransactionSql,
  ownerLogin: string,
  primary: SituationDefinitionRow,
  baseLabelJa: string,
): Promise<SituationDefinitionRow> {
  const lockKey = `secondary:${ownerLogin}:${primary.id}:${baseLabelJa}`;
  await transaction`select pg_advisory_xact_lock(hashtext(${lockKey}))`;
  const existing = await transaction<{ duplicate_sequence: number }[]>`
    select duplicate_sequence
    from situation_definitions
    where owner_login = ${ownerLogin}
      and parent_id = ${primary.id}
      and kind = 'secondary'
      and base_label_ja = ${baseLabelJa}
    order by duplicate_sequence asc
    for update
  `;
  const used = new Set(existing.map((row) => row.duplicate_sequence));
  let duplicateSequence = 0;
  while (used.has(duplicateSequence)) duplicateSequence += 1;

  const labelJa = duplicateSequence === 0
    ? baseLabelJa
    : `${baseLabelJa}-${String(duplicateSequence).padStart(3, "0")}`;
  const canonicalKey = stableCanonicalKey(
    "secondary",
    `${primary.canonical_key}:${labelJa}`,
  );
  const id = `sit_${crypto.randomUUID()}`;
  const rows = await transaction<SituationDefinitionRow[]>`
    insert into situation_definitions (
      id, owner_login, parent_id, kind, base_label_ja,
      duplicate_sequence, label_ja, canonical_key
    )
    values (
      ${id}, ${ownerLogin}, ${primary.id}, 'secondary', ${baseLabelJa},
      ${duplicateSequence}, ${labelJa}, ${canonicalKey}
    )
    returning id, owner_login, parent_id, kind, base_label_ja,
      duplicate_sequence, label_ja, canonical_key, status,
      sort_order, null::timestamptz as last_used_at, created_at, updated_at
  `;
  if (!rows[0]) throw new Error("Secondary situation could not be created.");
  return rows[0];
}

function buildAnkiIndex(
  primaryCanonicalKey: string,
  situationSequence: number,
  position: number,
  profileCode: GenerationProfileCode,
  patternCode: SentenceVariant["patternCode"],
): string {
  const patternOrdinal = patternCode === "default"
    ? 0
    : patternCode.charCodeAt(0) - "a".charCodeAt(0) + 1;
  return [
    primaryCanonicalKey,
    String(situationSequence).padStart(3, "0"),
    String(position + 1).padStart(2, "0"),
    String(profileOrder(profileCode) + 1).padStart(2, "0"),
    String(patternOrdinal).padStart(2, "0"),
  ].join("-");
}

function stableCanonicalKey(prefix: "primary" | "secondary", value: string): string {
  const normalized = value.normalize("NFKC").toLowerCase();
  const ascii = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (ascii.length >= 2) return `${prefix}-${ascii}`;
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

function normalizeSituationLabel(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/::/g, "・").replace(/\s+/g, " ").slice(0, 120)
    : "";
}

function toEntry(row: ExpressionEntryRow): ExpressionEntry {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    inputJa: row.input_ja,
    situationSequence: row.situation_sequence,
    primarySituation: null,
    secondarySituation: null,
    situationSelectedBy: null,
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
    patternCode: row.pattern_code,
    expressionEn: row.expression_en,
    translationJa: row.translation_ja,
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

function toSituationDefinition(row: SituationDefinitionRow): SituationDefinition {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    parentId: row.parent_id,
    kind: row.kind,
    baseLabelJa: row.base_label_ja,
    duplicateSequence: row.duplicate_sequence,
    labelJa: row.label_ja,
    canonicalKey: row.canonical_key,
    status: row.status,
    sortOrder: row.sort_order,
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
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
