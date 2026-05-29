import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

import type { SceneCard } from "@/lib/scenes";

const storedCardsVersion = 1;
const maxStoredCards = 500;
const maxSaveAttempts = 3;

type StoredCardsFile = {
  version?: unknown;
  cards?: unknown;
  updatedAt?: unknown;
};

type ReadStoredCardsResult = {
  cards: SceneCard[];
  etag: string | null;
};

export class MissingCardStoreError extends Error {
  constructor() {
    super("Card persistence is not configured.");
    this.name = "MissingCardStoreError";
  }
}

export function isCardPersistenceConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

export function getCardStorePathname(): string {
  return process.env.CARD_STORE_BLOB_PATH?.trim() || "scene-builder/cards.json";
}

export async function getStoredSceneCards(): Promise<SceneCard[]> {
  if (!isCardPersistenceConfigured()) {
    return [];
  }

  try {
    const { cards } = await readStoredCardsFile();
    return cards;
  } catch (error) {
    console.error("Failed to read stored scene cards.", error);
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

  await writeStoredCardsWithRetry((cards) => {
    const nextCards = cards.filter((candidate) => candidate.id !== normalizedCard.id);
    nextCards.push(normalizedCard);
    return nextCards.slice(-maxStoredCards);
  });

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

  let deleted = false;

  await writeStoredCardsWithRetry((cards) => {
    const nextCards = cards.filter((card) => card.id !== normalizedCardId);
    deleted = nextCards.length !== cards.length;
    return nextCards;
  });

  return deleted;
}

async function writeStoredCardsWithRetry(
  update: (cards: SceneCard[]) => SceneCard[],
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxSaveAttempts; attempt += 1) {
    const current = await readStoredCardsFile();
    const nextCards = update(current.cards);

    try {
      await writeStoredCardsFile(nextCards, current.etag);
      return;
    } catch (error) {
      lastError = error;

      if (!(error instanceof BlobPreconditionFailedError)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to update stored cards.");
}

async function readStoredCardsFile(): Promise<ReadStoredCardsResult> {
  const result = await get(getCardStorePathname(), {
    access: "private",
    useCache: false,
  });

  if (!result || result.statusCode === 304) {
    return { cards: [], etag: null };
  }

  const rawValue = await new Response(result.stream).text();
  const value = JSON.parse(rawValue) as StoredCardsFile;

  if (!isRecord(value) || value.version !== storedCardsVersion) {
    return { cards: [], etag: result.blob.etag };
  }

  const cards = Array.isArray(value.cards)
    ? value.cards
        .map(normalizeSceneCard)
        .filter((card): card is SceneCard => Boolean(card))
    : [];

  return { cards, etag: result.blob.etag };
}

async function writeStoredCardsFile(
  cards: SceneCard[],
  etag: string | null,
): Promise<void> {
  await put(
    getCardStorePathname(),
    JSON.stringify(
      {
        version: storedCardsVersion,
        updatedAt: new Date().toISOString(),
        cards,
      },
      null,
      2,
    ),
    {
      access: "private",
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
      ...(etag ? { ifMatch: etag } : {}),
    },
  );
}

function normalizeSceneCard(value: unknown): SceneCard | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getString(value.id);
  const sceneJa = getString(value.sceneJa);
  const promptEn = getString(value.promptEn);
  const levels = Array.isArray(value.levels)
    ? value.levels
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
    tags: Array.isArray(value.tags)
      ? value.tags.map(getString).filter(Boolean).slice(0, 8)
      : [],
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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
