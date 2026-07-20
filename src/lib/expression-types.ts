/**
 * Types shared by the SayDeck expression capture API, stores, and UI.
 *
 * These are application DTOs. Database rows use snake_case and are converted
 * at the store boundary so callers never need to know the SQL naming scheme.
 */

export const generationProfileCodes = ["L1", "L2", "L3", "L4"] as const;

export type GenerationProfileCode = (typeof generationProfileCodes)[number];

export type ExpressionEntryStatus =
  | "draft"
  | "generating"
  | "generated"
  | "registered"
  | "archived";

export type SentenceVariantStatus =
  | "draft"
  | "approved"
  | "audio_ready"
  | "audio_failed"
  | "stale"
  | "archived";

export type AudioAssetKind = "word" | "sentence";

export type AudioAssetStatus = "pending" | "ready" | "failed" | "stale";

export type AnkiExportStatus = "pending" | "ready" | "failed";

export type GenerationProfile = {
  ownerLogin: string;
  code: GenerationProfileCode;
  name: string;
  minWords: number;
  maxWords: number;
  maxSentences: number;
  requiredFeatures: string[];
  instruction: string;
  createdAt: string;
  updatedAt: string;
};

export type ExpressionEntry = {
  id: string;
  ownerLogin: string;
  inputJa: string;
  situationJa: string;
  genreSlug: string;
  situationTags: string[];
  status: ExpressionEntryStatus;
  registeredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SentenceCard = {
  id: string;
  ownerLogin: string;
  entryId: string;
  position: number;
  intentJa: string;
  createdAt: string;
  updatedAt: string;
  variants?: SentenceVariant[];
};

export type SentenceVariant = {
  id: string;
  ownerLogin: string;
  sentenceCardId: string;
  profileCode: GenerationProfileCode;
  english: string;
  japanese: string;
  keyExpression: string;
  definitionJa: string;
  irregularForms: string;
  constraints: string;
  reviewPoints: string;
  ankiGuid: string;
  ankiIndex: string;
  isSelected: boolean;
  status: SentenceVariantStatus;
  createdAt: string;
  updatedAt: string;
  audioAssets?: AudioAsset[];
};

export type AudioAsset = {
  id: string;
  ownerLogin: string;
  variantId: string;
  kind: AudioAssetKind;
  blobPath: string;
  textHash: string;
  provider: string;
  model: string;
  voice: string;
  locale: string;
  speed: number;
  format: string;
  status: AudioAssetStatus;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AnkiExport = {
  id: string;
  ownerLogin: string;
  status: AnkiExportStatus;
  cardCount: number;
  blobPath: string;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A normalized level-specific result returned by the generation adapter. */
export type GenerationVariant = {
  id?: string;
  profileCode: GenerationProfileCode;
  english: string;
  japanese: string;
  keyExpression: string;
  definitionJa: string;
  irregularForms: string;
  constraints: string;
  reviewPoints: string;
  ankiGuid?: string;
};

/** A meaning unit. The position is assigned again when persisting. */
export type GenerationSegment = {
  id?: string;
  position: number;
  intentJa: string;
  variants: GenerationVariant[];
};

export type GenerationResult = {
  segments: GenerationSegment[];
  suggestedGenreSlug?: string;
  suggestedSituationTags?: string[];
};

export type ExpressionEntryDetail = ExpressionEntry & {
  sentenceCards: SentenceCard[];
};
