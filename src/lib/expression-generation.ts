import type { AiProviderConfig } from "@/lib/ai-config";
import {
  generationAlternativeTargets,
} from "@/lib/expression-types";
import type {
  GenerationAlternativeAssessment,
  GenerationAlternativeTarget,
  GenerationExecution,
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

type AiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  error?: { message?: string };
};

type GenerationRetryContext = {
  initialResult: GenerationResult;
  standardOnlyPositions: number[];
};

const generationOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    primarySituationId: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 200 },
        { type: "null" },
      ],
    },
    primaryLabelJa: { type: "string", minLength: 1, maxLength: 120 },
    secondaryBaseLabelJa: { type: "string", minLength: 1, maxLength: 120 },
    segments: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          position: { type: "integer", minimum: 0, maximum: 7 },
          intentJa: { type: "string", minLength: 1, maxLength: 500 },
          standard: {
            type: "object",
            additionalProperties: false,
            properties: {
              profileCode: { const: "standard" },
              patternCode: { const: "default" },
              expressionEn: { type: "string", minLength: 1, maxLength: 2_000 },
              translationJa: { type: "string", minLength: 1, maxLength: 2_000 },
            },
            required: [
              "profileCode",
              "patternCode",
              "expressionEn",
              "translationJa",
            ],
          },
          alternatives: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                target: {
                  enum: ["native", "pattern_a", "pattern_b", "pattern_c"],
                },
                applicable: { type: "boolean" },
                reasonJa: { type: "string", minLength: 1, maxLength: 500 },
                expressionEn: {
                  anyOf: [
                    { type: "string", minLength: 1, maxLength: 2_000 },
                    { type: "null" },
                  ],
                },
                translationJa: {
                  anyOf: [
                    { type: "string", minLength: 1, maxLength: 2_000 },
                    { type: "null" },
                  ],
                },
              },
              required: [
                "target",
                "applicable",
                "reasonJa",
                "expressionEn",
                "translationJa",
              ],
            },
          },
        },
        required: ["position", "intentJa", "standard", "alternatives"],
      },
    },
  },
  required: [
    "primarySituationId",
    "primaryLabelJa",
    "secondaryBaseLabelJa",
    "segments",
  ],
} as const;

const sakanaGenerationOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    primarySituationId: { anyOf: [{ type: "string" }, { type: "null" }] },
    primaryLabelJa: { type: "string" },
    secondaryBaseLabelJa: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          position: { type: "integer" },
          intentJa: { type: "string" },
          standard: {
            type: "object",
            additionalProperties: false,
            properties: {
              profileCode: { const: "standard" },
              patternCode: { const: "default" },
              expressionEn: { type: "string" },
              translationJa: { type: "string" },
            },
            required: ["profileCode", "patternCode", "expressionEn", "translationJa"],
          },
          alternatives: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                target: { enum: ["native", "pattern_a", "pattern_b", "pattern_c"] },
                applicable: { type: "boolean" },
                reasonJa: { type: "string" },
                expressionEn: { anyOf: [{ type: "string" }, { type: "null" }] },
                translationJa: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              required: ["target", "applicable", "reasonJa", "expressionEn", "translationJa"],
            },
          },
        },
        required: ["position", "intentJa", "standard", "alternatives"],
      },
    },
  },
  required: ["primarySituationId", "primaryLabelJa", "secondaryBaseLabelJa", "segments"],
} as const;

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
  config: AiProviderConfig,
): Promise<GenerationExecution> {
  const initialResult = await requestGeneration(config, input);
  const standardOnlyPositions = initialResult.segments
    .filter((segment) => segment.variants.every(
      (variant) => variant.profileCode === "standard",
    ))
    .map((segment) => segment.position);

  if (standardOnlyPositions.length === 0) {
    return { result: initialResult, provider: config.provider, model: config.model };
  }

  try {
    const reevaluated = await requestGeneration(config, input, {
      initialResult,
      standardOnlyPositions,
    });
    return {
      result: mergeReevaluation(initialResult, reevaluated, standardOnlyPositions),
      provider: config.provider,
      model: config.model,
    };
  } catch {
    return { result: initialResult, provider: config.provider, model: config.model };
  }
}

async function requestGeneration(
  config: AiProviderConfig,
  input: GenerateExpressionInput,
  retryContext?: GenerationRetryContext,
): Promise<GenerationResult> {
  let response: Response;

  try {
    const systemPrompt = [
      "あなたは日本人学習者が、実際の場面で言いたい英語をAnki用に整理する編集者です。",
      "入力を必要な意味単位へ分け、各意味単位に必須の標準表現を作ってください。",
      "任意カードの生成は任意ですが、native・文法展開・熟語／句動詞・コロケーションの4対象を評価すること自体は必須です。",
      "日常的な入力では、自然な口語への短縮、別構文、句動詞、定型的な語の組み合わせがないか積極的に探してください。",
      "日本語入力の主張・理由・判断を一つも省略してはいけません。句点ごとの内容を確認し、1つの標準表現へ収まらない独立した発話行為は別の意味単位にしてください。",
      "標準表現は、その場でそのまま使える自然な一発話です。必要な詳細は含めてよいですが、複数の独立した内容を詰め込まず、意味単位へ分けてください。",
      "表現パターンは文法解説や単語断片ではなく、元の意図を保った完成英文にしてください。コロケーションは自然な米国英語で一般的な組み合わせを優先してください。",
      "似た英文を数合わせで増やしてはいけません。",
      "主シチュエーションは登録済み一覧と照合し、該当する場合だけそのIDを返してください。",
      "副シチュエーションは短い日本語の基底名を1つ返してください。",
      "英語は自然な米国英語、和訳はその英文に対応する自然な日本語にしてください。",
    ].join("\n");
    const userPrompt = buildPrompt(input, retryContext);
    const schema = config.provider === "sakana"
      ? sakanaGenerationOutputSchema
      : generationOutputSchema;
    const providerInput = config.provider === "sakana"
      ? { instructions: systemPrompt, input: userPrompt }
      : {
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        };

    response = await fetch(config.responsesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        ...providerInput,
        max_output_tokens: 5_000,
        reasoning: { effort: config.reasoningEffort },
        text: {
          format: {
            type: "json_schema",
            name: "saydeck_expression_generation",
            schema,
            strict: true,
          },
        },
        ...(config.provider === "xai" ? { store: false } : {}),
      }),
    });
  } catch (error) {
    throw new ExpressionGenerationError(
      "external_ai_unavailable",
      error instanceof Error ? error.message : "AI provider request failed.",
    );
  }

  const data = (await response.json().catch(() => ({}))) as AiResponse;

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
    return applyRequestedSegmentIntents(
      normalizeGeneration(parseJsonObject(text), input),
      input.segmentIntents,
    );
  } catch (error) {
    throw new ExpressionGenerationError(
      "invalid_response",
      error instanceof Error ? error.message : "AI response shape was invalid.",
    );
  }
}

function buildPrompt(
  input: GenerateExpressionInput,
  retryContext?: GenerationRetryContext,
): string {
  const profiles = profileByCode(input.profiles);
  const sourceSentences = input.inputJa
    .split(/(?<=[。！？!?])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const primarySituations = input.existingPrimarySituations.slice(0, 200).map((situation) => ({
    id: situation.id,
    labelJa: situation.labelJa,
    canonicalKey: situation.canonicalKey,
  }));

  return [
    `言いたいこと（日本語）: ${input.inputJa}`,
    `入力文の確認単位: ${sourceSentences.map((sentence, index) => `${index + 1}. ${sentence}`).join(" / ")}`,
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
    "- 短い単一発話だけならsegmentsは1件。入力文の確認単位に複数の主張・理由・判断があり、1つのstandardへ収めると発話行為が複数になる場合は最大8件へ分ける。",
    "- 入力文の確認単位に含まれる内容をすべて、いずれかのsegmentのintentJaとstandardで表す。都合の悪い後半や補足を省略しない。",
    "- standardは『その場でそのまま使える標準的な1発話』であり、各segmentに1件必須。原則1文・18語以内・発話行為1つにする。",
    "- standardには意図に必要な時刻・数量・理由・丁寧さを含めてよい。ただし独立して復習できる複数の依頼や説明は別segmentへ分ける。",
    `- standard / ${profiles.standard.name}: 必ず各segmentに1件。${profiles.standard.instruction}`,
    `- native / ${profiles.native.name}: ${profiles.native.instruction}`,
    `- pattern / ${profiles.pattern.name}: ${profiles.pattern.instruction}`,
    "- alternativesにはnative / pattern_a / pattern_b / pattern_cを、この順序で必ず1件ずつ返す。候補を作らない場合も省略せず、applicable=falseと具体的なreasonJaを返す。",
    "- applicable=trueならexpressionEnとtranslationJaを必ず返す。falseなら両方をnullにする。",
    "- 『任意』は評価を省略してよいという意味ではない。standardと同じ意図でも、自然な口語短縮、学習価値のある別構文、熟語・句動詞、一般的なコロケーションがあればapplicable=trueにする。",
    "- 単なる同義語1語の置換、意味の追加・削除、不自然なスラング、standardより不自然な文しか作れない場合だけapplicable=falseにする。",
    "- patternの種類: pattern_a=文法展開、pattern_b=熟語・句動詞、pattern_c=コロケーション。文法説明や語句だけではなく、必ず実際に発話できる完成英文を返す。",
    "- コロケーションは外部コーパスを検索したと主張せず、自然な米国英語で一般的な語の組み合わせとして判断する。",
    "- pattern_bではstandardにない熟語・句動詞を導入する。put ... on hold、hold off on、cool downのような候補を文脈に応じて検討してからfalseを判断する。",
    "- pattern_cではstandardにない学習価値のあるコロケーションを導入する。standardと同じ組み合わせを残して副詞を足しただけの文はpattern_cにしない。",
    "- 参考例: standard='I haven’t been running because of the rain.'、native='It’s been way too wet to run lately.'、pattern_a='The rain has kept me from running lately.'、pattern_b='I’ve put running on hold until the weather clears up.'、pattern_c='The heavy rain has made outdoor exercise difficult.'",
    "- expressionEnはその場で実際に口に出す英文、translationJaはその自然な和訳。",
    ...(retryContext
      ? [
          "",
          "再評価要件:",
          `- 初回結果でstandardしかなかったsegment位置: ${retryContext.standardOnlyPositions.map((position) => position + 1).join(", ")}`,
          "- 上記segmentの意味単位数・順序・standardは変えず、4対象をもう一度厳密に評価する。",
          "- 日常会話として短く自然に言う形、句動詞・定型句、別構文、一般的なコロケーションを見落としていないか確認する。",
          `- 初回結果: ${JSON.stringify(retryContext.initialResult)}`,
        ]
      : []),
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
          standard: {
            profileCode: "standard",
            patternCode: "default",
            expressionEn: "How have you been lately?",
            translationJa: "最近どうしてた？",
          },
          alternatives: [
            {
              target: "native",
              applicable: true,
              reasonJa: "会話ではeverythingを主語にした短い定型表現が自然だから。",
              expressionEn: "How’s everything been?",
              translationJa: "最近どう？",
            },
            {
              target: "pattern_a",
              applicable: true,
              reasonJa: "現在完了進行形で最近の継続的な様子を尋ねられるから。",
              expressionEn: "What have you been up to lately?",
              translationJa: "最近何してたの？",
            },
            {
              target: "pattern_b",
              applicable: true,
              reasonJa: "be up toは近況を尋ねる自然な定型表現だから。",
              expressionEn: "What have you been up to?",
              translationJa: "最近どうしてた？",
            },
            {
              target: "pattern_c",
              applicable: false,
              reasonJa: "この短い質問では、別カードにするほど明確なコロケーション差を作れないから。",
              expressionEn: null,
              translationJa: null,
            },
          ],
        },
      ],
    }),
  ].join("\n");
}

function applyRequestedSegmentIntents(
  result: GenerationResult,
  segmentIntents?: string[],
): GenerationResult {
  if (!segmentIntents?.length) return result;
  if (result.segments.length !== segmentIntents.length) {
    throw new Error("AI generation did not return the requested meaning units.");
  }
  return {
    ...result,
    segments: result.segments.map((segment, index) => ({
      ...segment,
      intentJa: segmentIntents[index],
    })),
  };
}

function mergeReevaluation(
  initial: GenerationResult,
  reevaluated: GenerationResult,
  standardOnlyPositions: number[],
): GenerationResult {
  if (initial.segments.length !== reevaluated.segments.length) {
    return initial;
  }

  const targetPositions = new Set(standardOnlyPositions);
  return {
    ...initial,
    segments: initial.segments.map((segment, index) => {
      if (!targetPositions.has(segment.position)) return segment;
      const standard = segment.variants.find(
        (variant) => variant.profileCode === "standard",
      );
      if (!standard) return segment;

      return {
        ...segment,
        variants: [
          standard,
          ...reevaluated.segments[index].variants.filter(
            (variant) => variant.profileCode !== "standard",
          ),
        ],
        assessments: reevaluated.segments[index].assessments,
      };
    }),
  };
}

function normalizeGeneration(
  value: unknown,
  input: GenerateExpressionInput,
): GenerationResult {
  if (!isRecord(value) || !Array.isArray(value.segments)) {
    throw new Error("AI generation must return a segments array.");
  }

  const segments = value.segments
    .map((segment, index) => normalizeSegment(segment, index, input.profiles));

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
): GenerationSegment {
  if (!isRecord(value) || !isRecord(value.standard) || !Array.isArray(value.alternatives)) {
    throw new Error("Every meaning unit must contain standard and alternatives.");
  }

  if (
    getString(value.standard.profileCode) !== "standard"
    || getString(value.standard.patternCode) !== "default"
  ) {
    throw new Error("standard must use profileCode standard and patternCode default.");
  }

  const standard = normalizeVariantFields({
    value: value.standard,
    profileCode: "standard",
    patternCode: "default",
    profiles,
  });
  const alternativesByTarget = new Map<
    GenerationAlternativeTarget,
    { assessment: GenerationAlternativeAssessment; variant?: GenerationVariant }
  >();

  for (const alternative of value.alternatives) {
    const normalized = normalizeAlternative(alternative, profiles);
    if (alternativesByTarget.has(normalized.assessment.target)) {
      throw new Error(`AI returned duplicate ${normalized.assessment.target} assessment.`);
    }
    alternativesByTarget.set(normalized.assessment.target, normalized);
  }

  for (const target of generationAlternativeTargets) {
    if (!alternativesByTarget.has(target)) {
      throw new Error(`AI did not evaluate ${target}.`);
    }
  }

  const alternatives = generationAlternativeTargets.map(
    (target) => alternativesByTarget.get(target)!,
  );
  return {
    position,
    intentJa: getString(value.intentJa) || `意味単位 ${position + 1}`,
    variants: [standard, ...alternatives.flatMap((alternative) => (
      alternative.variant ? [alternative.variant] : []
    ))].sort(
      (left, right) => profileOrder(left.profileCode) - profileOrder(right.profileCode)
        || left.patternCode.localeCompare(right.patternCode),
    ),
    assessments: alternatives.map((alternative) => alternative.assessment),
  };
}

function normalizeAlternative(
  value: unknown,
  profiles: GenerationProfile[],
): {
  assessment: GenerationAlternativeAssessment;
  variant?: GenerationVariant;
} {
  if (!isRecord(value)) {
    throw new Error("Every alternative assessment must be an object.");
  }

  const target = getString(value.target) as GenerationAlternativeTarget;
  if (!generationAlternativeTargets.includes(target)) {
    throw new Error("Alternative target must be native or pattern_a-c.");
  }

  if (typeof value.applicable !== "boolean") {
    throw new Error(`${target} must contain an applicability decision.`);
  }

  const reasonJa = getString(value.reasonJa);
  if (!reasonJa || reasonJa.length > 500) {
    throw new Error(`${target} must contain a concise Japanese reason.`);
  }

  const assessment: GenerationAlternativeAssessment = {
    target,
    applicable: value.applicable,
    reasonJa,
  };
  if (!value.applicable) {
    if (nullableString(value.expressionEn) || nullableString(value.translationJa)) {
      throw new Error(`${target} must not contain text when it is not applicable.`);
    }
    return { assessment };
  }

  const { profileCode, patternCode } = alternativeTargetCodes(target);
  return {
    assessment,
    variant: normalizeVariantFields({
      value,
      profileCode,
      patternCode,
      profiles,
    }),
  };
}

function alternativeTargetCodes(target: GenerationAlternativeTarget): {
  profileCode: GenerationProfileCode;
  patternCode: GenerationVariant["patternCode"];
} {
  if (target === "native") {
    return { profileCode: "native", patternCode: "default" };
  }
  return {
    profileCode: "pattern",
    patternCode: target.slice(-1) as "a" | "b" | "c",
  };
}

function normalizeVariantFields(input: {
  value: Record<string, unknown>;
  profileCode: GenerationProfileCode;
  patternCode: GenerationVariant["patternCode"];
  profiles: GenerationProfile[];
}): GenerationVariant {
  const expressionEn = getString(input.value.expressionEn);
  const translationJa = getString(input.value.translationJa);

  if (!expressionEn || !translationJa) {
    throw new Error(`${input.profileCode} must contain an English expression and Japanese translation.`);
  }
  if (expressionEn.length > 2_000 || translationJa.length > 2_000) {
    throw new Error(`${input.profileCode} is too long.`);
  }

  const profile = profileByCode(input.profiles)[input.profileCode];
  const wordCount = countEnglishWords(expressionEn);
  const sentenceCount = countSentences(expressionEn);

  if (wordCount < profile.minWords || wordCount > profile.maxWords) {
    throw new Error(`${input.profileCode} must contain ${profile.minWords}-${profile.maxWords} English words.`);
  }

  if (sentenceCount > profile.maxSentences) {
    throw new Error(`${input.profileCode} must contain at most ${profile.maxSentences} sentence(s).`);
  }

  return {
    profileCode: input.profileCode,
    patternCode: input.patternCode,
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

function getResponseText(data: AiResponse): string | undefined {
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
