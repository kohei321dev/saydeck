import { getSql, isDatabaseConfigured } from "@/lib/db";
import { devSceneCards } from "@/lib/dev-scene-cards";
import type { SceneCard } from "@/lib/scenes";

const maxStoredCards = 500;

type SceneCardSource = "sample" | "owner";

type SceneCardRow = {
  id: string;
  category: string;
  scene_ja: string;
  prompt_en: string;
  prompt_ja: string;
  tags: unknown;
  levels: unknown;
};

export class MissingCardStoreError extends Error {
  constructor() {
    super("Card persistence is not configured.");
    this.name = "MissingCardStoreError";
  }
}

export function isCardPersistenceConfigured(): boolean {
  return isDatabaseConfigured();
}

export function getCardStoreLocation(): string {
  return isCardPersistenceConfigured()
    ? "Neon/Postgres scene_cards"
    : "DATABASE_URL未設定";
}

export async function isCardStoreReady(): Promise<boolean> {
  if (!isCardPersistenceConfigured()) {
    return false;
  }

  try {
    const sql = getSql();
    const rows = await sql<{ exists: boolean }[]>`
      select to_regclass('public.scene_cards') is not null as exists
    `;
    return rows[0]?.exists === true;
  } catch (error) {
    console.error("Failed to check scene card store readiness.", error);
    return false;
  }
}

export async function getSampleSceneCards(): Promise<SceneCard[]> {
  if (!isCardPersistenceConfigured()) {
    if (isDevSeedEnabled()) {
      return devSceneCards;
    }

    return [];
  }

  try {
    return await getSceneCardsBySource("sample");
  } catch (error) {
    console.error("Failed to read sample scene cards.", error);
    return [];
  }
}

function isDevSeedEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function getStoredSceneCards(): Promise<SceneCard[]> {
  if (!isCardPersistenceConfigured()) {
    return [];
  }

  try {
    return await getSceneCardsBySource("owner");
  } catch (error) {
    console.error("Failed to read owner scene cards.", error);
    return [];
  }
}

export async function saveStoredSceneCard(card: SceneCard): Promise<SceneCard> {
  if (!isCardPersistenceConfigured()) {
    throw new MissingCardStoreError();
  }

  const normalizedCard = normalizeSceneCard(card);

  if (!normalizedCard) {
    throw new Error("Scene card shape is invalid.");
  }

  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    insert into scene_cards (
      id,
      category,
      scene_ja,
      prompt_en,
      prompt_ja,
      tags,
      levels,
      source,
      position,
      updated_at
    )
    values (
      ${normalizedCard.id},
      ${normalizedCard.category},
      ${normalizedCard.sceneJa},
      ${normalizedCard.promptEn},
      ${normalizedCard.promptJa},
      ${sql.json(normalizedCard.tags)},
      ${sql.json(normalizedCard.levels)},
      'owner',
      10000,
      now()
    )
    on conflict (id)
    do update set
      category = excluded.category,
      scene_ja = excluded.scene_ja,
      prompt_en = excluded.prompt_en,
      prompt_ja = excluded.prompt_ja,
      tags = excluded.tags,
      levels = excluded.levels,
      updated_at = now()
    where scene_cards.source = 'owner'
    returning id
  `;

  if (!rows[0]) {
    throw new Error("Scene card id conflicts with a sample card.");
  }

  await pruneStoredSceneCards();

  return normalizedCard;
}

export async function deleteStoredSceneCard(cardId: string): Promise<boolean> {
  if (!isCardPersistenceConfigured()) {
    throw new MissingCardStoreError();
  }

  const normalizedCardId = cardId.trim();

  if (!normalizedCardId) {
    return false;
  }

  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    delete from scene_cards
    where id = ${normalizedCardId}
      and source = 'owner'
    returning id
  `;

  return Boolean(rows[0]);
}

async function getSceneCardsBySource(source: SceneCardSource): Promise<SceneCard[]> {
  const sql = getSql();
  const rows = await sql<SceneCardRow[]>`
    select id, category, scene_ja, prompt_en, prompt_ja, tags, levels
    from scene_cards
    where source = ${source}
    order by position asc, created_at asc, id asc
  `;

  return rows
    .map(rowToSceneCard)
    .filter((card): card is SceneCard => Boolean(card));
}

async function pruneStoredSceneCards(): Promise<void> {
  const sql = getSql();

  await sql`
    delete from scene_cards
    where source = 'owner'
      and id in (
        select id
        from scene_cards
        where source = 'owner'
        order by created_at desc, id desc
        offset ${maxStoredCards}
      )
  `;
}

function rowToSceneCard(row: SceneCardRow): SceneCard | null {
  return normalizeSceneCard({
    id: row.id,
    category: row.category,
    sceneJa: row.scene_ja,
    promptEn: row.prompt_en,
    promptJa: row.prompt_ja,
    tags: row.tags,
    levels: row.levels,
  });
}

function normalizeSceneCard(value: unknown): SceneCard | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getString(value.id);
  const sceneJa = getString(value.sceneJa);
  const promptEn = getString(value.promptEn);
  const levelsValue = readJson(value.levels);
  const levels = Array.isArray(levelsValue)
    ? levelsValue
        .map(normalizeSceneLevel)
        .filter((level): level is SceneCard["levels"][number] => Boolean(level))
    : [];

  if (!id || !sceneJa || !promptEn || levels.length === 0) {
    return null;
  }

  return {
    id,
    category: getString(value.category) || "custom",
    sceneJa,
    promptEn,
    promptJa: getString(value.promptJa),
    tags: normalizeTags(value.tags),
    levels,
  };
}

function normalizeSceneLevel(value: unknown): SceneCard["levels"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const level = getString(value.level);

  if (!level) {
    return null;
  }

  return {
    level,
    name: getString(value.name) || level,
    constraints: getString(value.constraints),
    answerEn: getString(value.answerEn),
    answerJa: getString(value.answerJa),
    reviewPoints: getString(value.reviewPoints),
  };
}

function normalizeTags(value: unknown): string[] {
  const tagsValue = readJson(value);

  if (!Array.isArray(tagsValue)) {
    return [];
  }

  return tagsValue.map(getString).filter(Boolean).slice(0, 8);
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
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
