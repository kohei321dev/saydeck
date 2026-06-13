import type { SceneCard } from "@/lib/scenes";
import { getOwnerAiConfig } from "@/lib/ai-config";

export type GenerateCardInput = {
  category: string;
  sceneJa: string;
  tags: string[];
};

type XaiResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type GeneratedCardPayload = {
  category?: unknown;
  sceneJa?: unknown;
  promptEn?: unknown;
  promptJa?: unknown;
  tags?: unknown;
  levels?: unknown;
};

type GeneratedLevelPayload = {
  level?: unknown;
  name?: unknown;
  constraints?: unknown;
  answerEn?: unknown;
  answerJa?: unknown;
  reviewPoints?: unknown;
};

export class MissingCardGenerationApiKeyError extends Error {
  constructor() {
    super("OWNER_AI_KEY is not configured.");
    this.name = "MissingCardGenerationApiKeyError";
  }
}

export async function generateSceneCardWithAi({
  category,
  sceneJa,
  tags,
}: GenerateCardInput): Promise<SceneCard> {
  let config: ReturnType<typeof getOwnerAiConfig>;

  try {
    config = getOwnerAiConfig();
  } catch {
    throw new MissingCardGenerationApiKeyError();
  }

  const response = await fetch("https://api.x.ai/v1/responses", {
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
            "あなたは英検3級レベルから日常英会話を伸ばす英語教材作成者です。",
            "スケボー中に自然に使える短い英文練習カードを作ります。",
            "必ずJSONだけを返してください。Markdownやコードフェンスは不要です。",
          ].join("\n"),
        },
        {
          role: "user",
          content: buildCardPrompt({ category, sceneJa, tags }),
        },
      ],
      max_output_tokens: 1200,
      reasoning: {
        effort: config.reasoningEffort,
      },
      store: false,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as XaiResponsesApiResponse;

  if (!response.ok) {
    throw new Error(
      data.error?.message || `AI card generation failed. status=${response.status}`,
    );
  }

  const content = getResponseText(data);

  if (!content) {
    throw new Error("AI card generation response was empty.");
  }

  return normalizeGeneratedCard(parseJsonObject(content), { category, sceneJa, tags });
}

function buildCardPrompt({ category, sceneJa, tags }: GenerateCardInput): string {
  return [
    "次の日本語の気づきから、英語練習カードを1つ作ってください。",
    "目的は、日本語文を英訳することではなく、学習者がシチュエーションを想像して自分で会話を作る練習にすることです。",
    "",
    `カテゴリ: ${category}`,
    `日本語の気づき: ${sceneJa}`,
    `タグ: ${tags.join(";") || "なし"}`,
    "",
    "要件:",
    "- sceneJaは日本語で、学習者が想像しやすい短い場面説明にする",
    "- promptEnは英語で、補助的な短い場面説明にする",
    "- promptJaは日本語で、補助情報にする。主問題として直訳させる文章にしない",
    "- levelsはL1からL4まで必ず4件",
    "- L1は動詞や動作を出す練習",
    "- L2は動詞に状態や感情を表す形容詞/語句を足す練習",
    "- L3はシチュエーションへの自然な短い返答を作る練習",
    "- L4は理由、感想、相手への一言を足して会話にする練習",
    "- answerEnは自然で短い英語",
    "- answerJaはanswerEnの自然な日本語訳",
    "- reviewPointsはヒントとして使える動詞、形容詞、表現、評価観点を短く書く",
    "",
    "返却JSONの形:",
    JSON.stringify({
      category: "practice",
      sceneJa: "外国人の友達に今日の練習メニューを話す",
      promptEn: "Imagine talking with a friend at the skatepark.",
      promptJa: "スケボー場で友達と話す場面。何を練習したいかを自分で考える。",
      tags: ["practice", "friend"],
      levels: [
        {
          level: "L1",
          name: "Verb focus",
          constraints: "Use simple verbs or a very short sentence.",
          answerEn: "I want to practice ollies.",
          answerJa: "オーリーを練習したいです。",
          reviewPoints: "verbs: practice, try, work on",
        },
        {
          level: "L2",
          name: "Add detail",
          constraints: "Add one state, feeling, or adjective.",
          answerEn: "I want to practice higher ollies today.",
          answerJa: "今日はもっと高いオーリーを練習したいです。",
          reviewPoints: "adjectives: higher, stable, hard",
        },
        {
          level: "L3",
          name: "Scene response",
          constraints: "Make a natural short response for the scene.",
          answerEn: "I want to practice higher ollies today because my timing is weak.",
          answerJa: "タイミングが弱いので、今日はもっと高いオーリーを練習したいです。",
          reviewPoints: "Add a reason if it helps the scene.",
        },
        {
          level: "L4",
          name: "Conversation",
          constraints: "Make it useful as a real conversation.",
          answerEn: "I want to practice higher ollies today. Can you watch my timing?",
          answerJa: "今日はもっと高いオーリーを練習したいです。タイミングを見てもらえますか。",
          reviewPoints: "Add a reason, feeling, or one short question.",
        },
      ],
    }),
  ].join("\n");
}

function normalizeGeneratedCard(
  value: unknown,
  input: GenerateCardInput,
): SceneCard {
  if (!isRecord(value)) {
    throw new Error("AI card generation JSON shape was invalid.");
  }

  const payload = value as GeneratedCardPayload;
  const levels = Array.isArray(payload.levels)
    ? payload.levels
        .map(normalizeLevel)
        .filter((level): level is SceneCard["levels"][number] => Boolean(level))
    : [];

  if (levels.length !== 4) {
    throw new Error("AI card generation must return four levels.");
  }

  return {
    id: `custom-${crypto.randomUUID().slice(0, 8)}`,
    category: getString(payload.category) || input.category,
    sceneJa: getString(payload.sceneJa) || input.sceneJa,
    promptEn: getString(payload.promptEn),
    promptJa: getString(payload.promptJa) || `${input.sceneJa}を英語で伝えてください。`,
    tags: normalizeTags(payload.tags, input.tags),
    levels,
  };
}

function normalizeLevel(value: unknown): SceneCard["levels"][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const payload = value as GeneratedLevelPayload;
  const level = getString(payload.level);

  if (!["L1", "L2", "L3", "L4"].includes(level)) {
    return null;
  }

  return {
    level,
    name: getString(payload.name) || level,
    constraints: getString(payload.constraints),
    answerEn: getString(payload.answerEn),
    answerJa: getString(payload.answerJa),
    reviewPoints: getString(payload.reviewPoints),
  };
}

function normalizeTags(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((tag) => getString(tag)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(";").map((tag) => tag.trim()).filter(Boolean);
  }

  return fallback;
}

function getResponseText(data: XaiResponsesApiResponse): string | undefined {
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
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error("AI card generation response was not JSON.");
  }

  return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
