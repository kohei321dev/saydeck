import {
  AiModelNotAllowedError,
  MissingAiApiKeyError,
  getOwnerAiConfig,
} from "@/lib/ai-config";
import { generationProfileCodes } from "@/lib/expression-types";
import type {
  GenerationResult,
  GenerationSegment,
  GenerationVariant,
  GenerationProfileCode,
  GenerationProfile,
} from "@/lib/expression-types";
import { profileByCode } from "@/lib/generation-profiles";
import {
  normalizeSituationTags,
  situationTagPoolPrompt,
} from "@/lib/situation-tags";

type GenerateExpressionInput = {
  inputJa: string;
  genreSlug: string;
  legacySituationJa?: string;
  existingSituationTags: string[];
  segmentIntents?: string[];
  profiles: GenerationProfile[];
};

type XaiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  error?: { message?: string };
};

export class ExpressionGenerationError extends Error {
  code: "invalid_response" | "external_ai_quota_exceeded" | "external_ai_unavailable";
  status: number;

  constructor(
    code: ExpressionGenerationError["code"],
    message: string,
    status = 502,
  ) {
    super(message);
    this.name = "ExpressionGenerationError";
    this.code = code;
    this.status = status;
  }
}

export async function generateExpressionWithAi(
  input: GenerateExpressionInput,
): Promise<GenerationResult> {
  let config;

  try {
    config = getOwnerAiConfig();
  } catch (error) {
    if (error instanceof MissingAiApiKeyError || error instanceof AiModelNotAllowedError) {
      throw error;
    }

    throw new ExpressionGenerationError(
      "external_ai_unavailable",
      "AI provider configuration is unavailable.",
      503,
    );
  }

  let response: Response;

  try {
    response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: [
          {
            role: "system",
            content: [
              "あなたは日本人学習者向けの英語教材作成者です。",
              "日本語の気づきを、自然な英語表現カードへ変換してください。",
              "言いたいことからシチュエーションを分類し、必ず1〜3件の日本語タグを返してください。",
              "必ずJSONだけを返し、Markdownやコードフェンスは使わないでください。",
              "独立した発話意図が複数ある場合だけsegmentsを分割してください。",
            ].join("\n"),
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
        max_output_tokens: 2400,
        reasoning: { effort: config.reasoningEffort },
        store: false,
      }),
    });
  } catch (error) {
    throw new ExpressionGenerationError(
      "external_ai_unavailable",
      error instanceof Error ? error.message : "AI provider request failed.",
    );
  }

  const data = (await response.json().catch(() => ({}))) as XaiResponse;

  if (!response.ok) {
    const message = data.error?.message ?? `AI request failed (${response.status}).`;
    const quota = response.status === 402 || response.status === 429 ||
      /quota|credit|rate.?limit|too many requests/i.test(message);

    throw new ExpressionGenerationError(
      quota ? "external_ai_quota_exceeded" : "external_ai_unavailable",
      message,
      quota ? 429 : 502,
    );
  }

  const text = getResponseText(data);

  if (!text) {
    throw new ExpressionGenerationError(
      "invalid_response",
      "AI response was empty.",
    );
  }

  try {
    const result = normalizeGeneration(parseJsonObject(text), input.profiles);
    if (!input.segmentIntents?.length) return result;
    if (result.segments.length !== input.segmentIntents.length) {
      throw new Error("AI generation did not return the requested meaning units.");
    }
    return {
      ...result,
      segments: result.segments.map((segment, index) => ({
        ...segment,
        intentJa: input.segmentIntents![index],
      })),
    };
  } catch (error) {
    throw new ExpressionGenerationError(
      "invalid_response",
      error instanceof Error ? error.message : "AI response shape was invalid.",
    );
  }
}

function buildPrompt(input: GenerateExpressionInput): string {
  return [
    `言いたいこと（日本語）: ${input.inputJa}`,
    `ジャンル: ${input.genreSlug || "未指定（英語slugを提案）"}`,
    `旧シチュエーション入力（存在する場合だけ参考にする）: ${input.legacySituationJa || "なし"}`,
    `既存シチュエーションタグ（再生成時の参考。正しいとは限らない）: ${input.existingSituationTags.join(", ") || "なし"}`,
    `優先タグプール: ${situationTagPoolPrompt()}`,
    input.segmentIntents?.length
      ? `意味単位（この順序と件数を必ず使用）: ${input.segmentIntents.map((intent, index) => `${index + 1}. ${intent}`).join(" / ")}`
      : "意味単位: AIが独立した発話意図だけを分割する。",
    "",
    "出力要件:",
    "- segmentsは意味単位ごとの配列。通常は1件、独立した発話意図があれば最大4件。指定された意味単位がある場合は、その件数と順序を守る。",
    "- suggestedSituationTagsは必ず1〜3件。入力に合う優先タグプールの値を完全一致で優先し、最も中心となるタグを先頭に置く。プールに該当しない場合だけ短い日本語タグを生成する。",
    "- 各segmentにintentJaとL1〜L4のvariantsを必ず作る。",
    ...Object.values(profileByCode(input.profiles)).map(
      (profile) => `- ${profile.code} / ${profile.name}: ${profile.maxSentences}文以内、${profile.minWords}〜${profile.maxWords}語。${profile.instruction}`,
    ),
    "- englishは自然な英文、japaneseは英文の自然な日本語訳。",
    "- keyExpressionは復習したい短い英語表現、definitionJaはその日本語の意味。",
    "- irregularFormsは不規則変化がある場合だけ記載し、なければ空文字。",
    "- reviewPointsは短い学習ポイント。",
    "",
    "返却JSON:",
    JSON.stringify({
      suggestedGenreSlug: "skatepark",
      suggestedSituationTags: ["友人への返信", "SNS・DM"],
      segments: [
        {
          position: 0,
          intentJa: "今日の練習内容を友達に伝える",
          variants: [
            {
              profileCode: "L1",
              english: "I want to practice ollies.",
              japanese: "オーリーを練習したいです。",
              keyExpression: "practice ollies",
              definitionJa: "オーリーを練習する",
              irregularForms: "",
              constraints: profileByCode(input.profiles).L1.instruction,
              reviewPoints: "動作を表す動詞を使う",
            },
          ],
        },
      ],
    }),
  ].join("\n");
}

function normalizeGeneration(value: unknown, profiles: GenerationProfile[]): GenerationResult {
  if (!isRecord(value) || !Array.isArray(value.segments)) {
    throw new Error("AI generation must return a segments array.");
  }

  const segments = value.segments
    .map((segment, index) => normalizeSegment(segment, index, profiles))
    .filter((segment): segment is GenerationSegment => Boolean(segment));

  if (segments.length === 0 || segments.length > 4) {
    throw new Error("AI generation must return between one and four segments.");
  }

  return {
    segments,
    suggestedGenreSlug: normalizeSlug(value.suggestedGenreSlug),
    suggestedSituationTags: normalizeRequiredSituationTags(value.suggestedSituationTags),
  };
}

function normalizeSegment(value: unknown, position: number, profiles: GenerationProfile[]): GenerationSegment | null {
  if (!isRecord(value) || !Array.isArray(value.variants)) {
    return null;
  }

  const variants = value.variants
    .map((variant) => normalizeVariant(variant, profiles))
    .filter((variant): variant is GenerationVariant => Boolean(variant));
  const byProfile = new Map(variants.map((variant) => [variant.profileCode, variant]));

  if (byProfile.size !== 4) {
    return null;
  }

  return {
    position,
    intentJa: getString(value.intentJa) || `意味単位 ${position + 1}`,
    variants: (["L1", "L2", "L3", "L4"] as const).map(
      (code) => byProfile.get(code) as GenerationVariant,
    ),
  };
}

function normalizeVariant(value: unknown, profiles: GenerationProfile[]): GenerationVariant | null {
  if (!isRecord(value)) {
    return null;
  }

  const profileCode = getString(value.profileCode);

  if (!generationProfileCodes.includes(profileCode as GenerationProfileCode)) {
    return null;
  }

  const english = getString(value.english);

  if (!english) {
    return null;
  }

  const profile = profileByCode(profiles)[profileCode as GenerationProfileCode];
  const wordCount = countEnglishWords(english);
  const sentenceCount = countSentences(english);

  if (wordCount < profile.minWords || wordCount > profile.maxWords) {
    throw new Error(`${profileCode} must contain ${profile.minWords}-${profile.maxWords} English words.`);
  }

  if (sentenceCount > profile.maxSentences) {
    throw new Error(`${profileCode} must contain at most ${profile.maxSentences} sentence(s).`);
  }

  return {
    profileCode: profileCode as GenerationProfileCode,
    english,
    japanese: getString(value.japanese),
    keyExpression: getString(value.keyExpression) || english.split(/\s+/).slice(0, 4).join(" "),
    definitionJa: getString(value.definitionJa),
    irregularForms: getString(value.irregularForms),
    constraints: getString(value.constraints) || profile.instruction,
    reviewPoints: getString(value.reviewPoints),
  };
}

function countEnglishWords(value: string): number {
  return value.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function countSentences(value: string): number {
  return Math.max(1, value.match(/[.!?]+(?=\s|$)/g)?.length ?? 0);
}

function getResponseText(data: XaiResponse): string | undefined {
  if (data.output_text) {
    return data.output_text;
  }

  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.text) {
        return content.text;
      }
    }
  }

  return undefined;
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("AI response was not JSON.");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSlug(value: unknown): string {
  return getString(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeRequiredSituationTags(value: unknown): string[] {
  const tags = normalizeSituationTags(value);
  if (tags.length === 0) {
    throw new Error("AI generation must return at least one situation tag.");
  }
  return tags;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
