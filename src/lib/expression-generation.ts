import {
  AiModelNotAllowedError,
  MissingAiApiKeyError,
  getOwnerAiConfig,
} from "@/lib/ai-config";
import {
  generationProfileCodes,
  detailPatternCodes,
} from "@/lib/expression-types";
import type {
  GenerationProfile,
  GenerationProfileCode,
  GenerationResult,
  GenerationSegment,
  GenerationVariant,
  SituationDefinition,
} from "@/lib/expression-types";
import {
  profileByCode,
  profileOrder,
} from "@/lib/generation-profiles";

type GenerateExpressionInput = {
  inputJa: string;
  existingPrimarySituations: SituationDefinition[];
  preferredPrimarySituationId?: string;
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
              "あなたは日本人学習者が、実際の場面で言いたい英語をAnki用に整理する編集者です。",
              "入力を必要な意味単位へ分け、各意味単位に必須の基本表現と、学習価値がある場合だけ任意の表現レイヤーを作ってください。",
              "基本表現は難易度の最下層ではなく、最小限で標準的な一発話です。条件・仮定・理由・時刻や数量・追加依頼・間接的な丁寧表現を基本表現へ詰め込まず、必要なら意味単位または詳細表現へ分けてください。会話表現は口語性のレイヤーであり、基本表現より短い、または文法的に易しい場合があります。",
              "似た英文を数合わせで増やしてはいけません。",
              "主シチュエーションは登録済み一覧と照合し、該当する場合だけそのIDを返してください。",
              "副シチュエーションは短い日本語の基底名を1つ返してください。",
              "英語は自然な米国英語、和訳はその英文に対応する自然な日本語にしてください。",
              "必ずJSONだけを返し、Markdownやコードフェンスは使わないでください。",
            ].join("\n"),
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
        max_output_tokens: 3_600,
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
    const quota = response.status === 402 || response.status === 429
      || /quota|credit|rate.?limit|too many requests/i.test(message);

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
    const result = normalizeGeneration(parseJsonObject(text), input);
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
  const profiles = profileByCode(input.profiles);
  const primarySituations = input.existingPrimarySituations.slice(0, 200).map((situation) => ({
    id: situation.id,
    labelJa: situation.labelJa,
    canonicalKey: situation.canonicalKey,
  }));

  return [
    `言いたいこと（日本語）: ${input.inputJa}`,
    `登録済み主シチュエーション一覧: ${JSON.stringify(primarySituations)}`,
    `入力時にユーザーが優先した主シチュエーションID: ${input.preferredPrimarySituationId || "なし"}`,
    input.segmentIntents?.length
      ? `意味単位（この順序と件数を必ず使用）: ${input.segmentIntents.map((intent, index) => `${index + 1}. ${intent}`).join(" / ")}`
      : "意味単位: 1枚で扱うと意味が欠ける場合だけ、独立して復習できる単位へ分割する。",
    "",
    "分類要件:",
    "- primarySituationId: 登録済み一覧に意味が該当する場合はそのid。該当しない場合はnull。存在しないIDを作らない。",
    "- primaryLabelJa: 既存IDを選んだ場合はその表示名。新規の場合はdeck名として繰り返し使える、広い場面の短い日本語名。",
    "- secondaryBaseLabelJa: 今回の目的・文脈を表す短い日本語名。必須。末尾の-001などは付けない。",
    "- 優先IDが入力内容に合う場合は優先するが、合わない場合は別の既存IDまたは新規分類を提案する。",
    "",
    "表現要件:",
    "- segmentsは通常1件。複数の独立した内容が必要な場合だけ最大8件。",
    "- basicは『最小・標準・単独で使える1発話』であり、難易度順ではない。各basicは原則1文・12語以内・発話行為1つにする。",
    "- basicにはif/when/unless等の条件・仮定、because等の理由、時刻や数量、追加依頼、could you/would you等で緩和した間接依頼を含めない。これらが必要なら別の意味単位に分けるかdetailに置く。",
    "- 例: basicは 'I'm running late.'、'Please go in first.'、'Tell the restaurant we'll be late.' のようにする。'If it looks like we'll miss the reservation, could you let the restaurant know we'll be a bit late?' はdetailでありbasicにしない。",
    `- basic / ${profiles.basic.name}: 必ず各segmentに1件。${profiles.basic.instruction}`,
    `- detail / ${profiles.detail.name}: ${profiles.detail.instruction}`,
    `- conversation / ${profiles.conversation.name}: ${profiles.conversation.instruction}`,
    `- natural_alternative / ${profiles.natural_alternative.name}: ${profiles.natural_alternative.instruction}`,
    "- 任意レイヤーに基本表現と実質的な差がなければ、そのvariant自体を返さない。",
    "- basic / conversation / natural_alternative は各segmentで最大1件。detailは適用できるパターンだけ複数返してよい。patternCodeはdetailならa〜eを必須、他のprofileはdefaultとする。",
    "- detailのパターン: a=形容詞・補語、b=副詞・程度、c=前置詞句、d=熟語・定型結合（句動詞・コロケーション）、e=文法展開。01と実質同じ文や、入力に適用できないパターンは返さない。最大5件。",
    "- 例: basicが 'I have to leave early.' の場合、適用できれば 02b='I really have to leave early.'、02c='I have to leave early for work.'、02d='I have to head out early.'、02e='I might have to leave early.' のように、各patternの違いが英文そのものに現れるようにする。",
    "- expressionEnはその場で実際に口に出す英文、translationJaはその自然な和訳。",
    "",
    "返却JSON:",
    JSON.stringify({
      primarySituationId: primarySituations[0]?.id ?? null,
      primaryLabelJa: primarySituations[0]?.labelJa ?? "友人との連絡",
      secondaryBaseLabelJa: "久しぶりの連絡",
      segments: [
        {
          position: 0,
          intentJa: "久しぶりの友人に近況を尋ねる",
          variants: [
            {
              profileCode: "basic",
              patternCode: "default",
              expressionEn: "It’s been a while. How have you been?",
              translationJa: "久しぶりだね。元気にしてた？",
            },
            {
              profileCode: "conversation",
              patternCode: "default",
              expressionEn: "Hey, long time no see! How’s everything going?",
              translationJa: "やあ、久しぶり！最近どう？",
            },
          ],
        },
      ],
    }),
  ].join("\n");
}

function normalizeGeneration(
  value: unknown,
  input: GenerateExpressionInput,
): GenerationResult {
  if (!isRecord(value) || !Array.isArray(value.segments)) {
    throw new Error("AI generation must return a segments array.");
  }

  const segments = value.segments
    .map((segment, index) => normalizeSegment(segment, index, input.profiles))
    .filter((segment): segment is GenerationSegment => Boolean(segment));

  if (segments.length === 0 || segments.length > 8) {
    throw new Error("AI generation must return between one and eight segments.");
  }

  const primarySituationId = nullableString(value.primarySituationId);
  const matchedPrimary = primarySituationId
    ? input.existingPrimarySituations.find((item) => item.id === primarySituationId)
    : undefined;

  if (primarySituationId && !matchedPrimary) {
    throw new Error("AI returned an unknown primary situation ID.");
  }

  const primaryLabelJa = matchedPrimary?.labelJa ?? getString(value.primaryLabelJa);
  const secondaryBaseLabelJa = normalizeSituationLabel(value.secondaryBaseLabelJa);

  if (!primaryLabelJa) {
    throw new Error("AI generation must return a primary situation label.");
  }

  if (!secondaryBaseLabelJa) {
    throw new Error("AI generation must return a secondary situation label.");
  }

  return {
    segments,
    situationSuggestion: {
      primarySituationId: matchedPrimary?.id ?? null,
      primaryLabelJa: normalizeSituationLabel(primaryLabelJa),
      secondaryBaseLabelJa,
    },
  };
}

function normalizeSegment(
  value: unknown,
  position: number,
  profiles: GenerationProfile[],
): GenerationSegment | null {
  if (!isRecord(value) || !Array.isArray(value.variants)) {
    return null;
  }

  const variants = value.variants
    .map((variant) => normalizeVariant(variant, profiles))
    .filter((variant): variant is GenerationVariant => Boolean(variant));
  const byKey = new Map<string, GenerationVariant>();

  for (const variant of variants) {
    const key = `${variant.profileCode}:${variant.patternCode}`;
    if (byKey.has(key)) {
      throw new Error(`AI returned duplicate ${key} variants.`);
    }
    byKey.set(key, variant);
  }

  if (!Array.from(byKey.values()).some((variant) => variant.profileCode === "basic")) {
    throw new Error("Every meaning unit must contain a basic expression.");
  }

  return {
    position,
    intentJa: getString(value.intentJa) || `意味単位 ${position + 1}`,
    variants: Array.from(byKey.values()).sort(
      (left, right) => profileOrder(left.profileCode) - profileOrder(right.profileCode)
        || left.patternCode.localeCompare(right.patternCode),
    ),
  };
}

function normalizeVariant(
  value: unknown,
  profiles: GenerationProfile[],
): GenerationVariant | null {
  if (!isRecord(value)) {
    return null;
  }

  const profileCode = getString(value.profileCode);

  if (!generationProfileCodes.includes(profileCode as GenerationProfileCode)) {
    return null;
  }

  const rawPatternCode = getString(value.patternCode) || "default";
  const patternCode = rawPatternCode as GenerationVariant["patternCode"];
  if (profileCode === "detail") {
    if (!detailPatternCodes.includes(patternCode as (typeof detailPatternCodes)[number])) {
      throw new Error("detail must contain patternCode a-e.");
    }
  } else if (patternCode !== "default") {
    throw new Error(`${profileCode} must use patternCode default.`);
  }

  const expressionEn = getString(value.expressionEn);
  const translationJa = getString(value.translationJa);

  if (!expressionEn || !translationJa) {
    throw new Error(`${profileCode} must contain an English expression and Japanese translation.`);
  }

  if (expressionEn.length > 2_000 || translationJa.length > 2_000) {
    throw new Error(`${profileCode} is too long.`);
  }

  const profile = profileByCode(profiles)[profileCode as GenerationProfileCode];
  const wordCount = countEnglishWords(expressionEn);
  const sentenceCount = countSentences(expressionEn);

  if (wordCount < profile.minWords || wordCount > profile.maxWords) {
    throw new Error(`${profileCode} must contain ${profile.minWords}-${profile.maxWords} English words.`);
  }

  if (sentenceCount > profile.maxSentences) {
    throw new Error(`${profileCode} must contain at most ${profile.maxSentences} sentence(s).`);
  }

  return {
    profileCode: profileCode as GenerationProfileCode,
    patternCode,
    expressionEn,
    translationJa,
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

function nullableString(value: unknown): string | null {
  const text = getString(value);
  return text || null;
}

function normalizeSituationLabel(value: unknown): string {
  return getString(value)
    .replace(/::/g, "・")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
