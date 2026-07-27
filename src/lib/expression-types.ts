/**
 * Types shared by the SayDeck expression capture API, stores, and UI.
 *
 * These are application DTOs. Database rows use snake_case and are converted
 * at the store boundary so callers never need to know the SQL naming scheme.
 */

export const generationProfileCodes = [
  "standard",
  "native",
  "pattern",
] as const;

export type GenerationProfileCode = (typeof generationProfileCodes)[number];

/** Pattern cards are grouped by their explicit learning focus. */
export const expressionPatternCodes = ["a", "b", "c"] as const;
export type ExpressionPatternCode = (typeof expressionPatternCodes)[number];
export type VariantPatternCode = "default" | ExpressionPatternCode;

/** Every optional expression target is evaluated even when no card is created. */
export const generationAlternativeTargets = [
  "native",
  "pattern_a",
  "pattern_b",
  "pattern_c",
] as const;
export type GenerationAlternativeTarget = (typeof generationAlternativeTargets)[number];

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

export type AudioAssetStatus = "pending" | "ready" | "failed" | "stale";

export type AnkiExportStatus = "pending" | "ready" | "failed";

export type SituationKind = "primary" | "secondary";

export type SituationStatus = "active" | "archived";

export type SituationSelectedBy = "ai" | "user";

export type SituationDefinition = {
  id: string;
  ownerLogin: string;
  parentId: string | null;
  kind: SituationKind;
  baseLabelJa: string;
  duplicateSequence: number;
  labelJa: string;
  canonicalKey: string;
  status: SituationStatus;
  sortOrder: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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
  situationSequence: number | null;
  primarySituation: SituationDefinition | null;
  secondarySituation: SituationDefinition | null;
  situationSelectedBy: SituationSelectedBy | null;
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
  patternCode: VariantPatternCode;
  expressionEn: string;
  translationJa: string;
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
  patternCode: VariantPatternCode;
  expressionEn: string;
  translationJa: string;
  ankiGuid?: string;
};

export type GenerationAlternativeAssessment = {
  target: GenerationAlternativeTarget;
  applicable: boolean;
  reasonJa: string;
};

/** A meaning unit. The position is assigned again when persisting. */
export type GenerationSegment = {
  id?: string;
  position: number;
  intentJa: string;
  variants: GenerationVariant[];
  assessments: GenerationAlternativeAssessment[];
};

export type GenerationResult = {
  segments: GenerationSegment[];
  situationSuggestion: SituationSuggestion;
};

export type SituationSuggestion = {
  primarySituationId: string | null;
  primaryLabelJa: string;
  secondaryBaseLabelJa: string;
};

export type ExpressionEntryDetail = ExpressionEntry & {
  sentenceCards: SentenceCard[];
};
