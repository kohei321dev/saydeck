import type { GenerationProfile, GenerationProfileCode, VariantPatternCode } from "@/lib/expression-types";

type DefaultProfile = Omit<GenerationProfile, "ownerLogin" | "createdAt" | "updatedAt">;

const defaults: Record<GenerationProfileCode, DefaultProfile> = {
  standard: {
    code: "standard",
    name: "01_標準表現",
    minWords: 2,
    maxWords: 18,
    maxSentences: 1,
    requiredFeatures: ["required", "standard_grammar", "single_speech_act", "necessary_detail"],
    instruction: "必須。1文・原則18語以内で、1つの発話行為を標準的で自然な英語にする。入力の意図に必要な時刻・数量・理由などは含めてよいが、独立して復習できる複数の内容は意味単位に分け、1文へ詰め込まない。",
  },
  native: {
    code: "native",
    name: "02_ネイティブ・口語表現",
    minWords: 2,
    maxWords: 22,
    maxSentences: 1,
    requiredFeatures: ["optional", "native", "spoken", "conversational"],
    instruction: "任意。01と同じ意図を、ネイティブ話者が会話で実際に使う省略・定型句・自然な語順で表す。01と明確な差がある場合だけ1件生成し、過度なスラングや単なる同義語置換は避ける。",
  },
  pattern: {
    code: "pattern",
    name: "03_表現パターン",
    minWords: 2,
    maxWords: 22,
    maxSentences: 1,
    requiredFeatures: ["optional", "learning_pattern", "complete_utterance"],
    instruction: "任意。01を土台に、学習価値のある文法展開・熟語や句動詞・コロケーションを使った完成英文を生成する。適用可能なpatternだけ最大3件とし、文法解説や単語断片だけのカードは作らない。",
  },
};

export const profileDisplayOrder: GenerationProfileCode[] = [
  "standard",
  "native",
  "pattern",
];

export function defaultGenerationProfiles(ownerLogin: string): GenerationProfile[] {
  const now = new Date().toISOString();
  return (Object.values(defaults) as DefaultProfile[]).map((profile) => ({ ...profile, ownerLogin, createdAt: now, updatedAt: now }));
}

export function profileByCode(profiles: GenerationProfile[]): Record<GenerationProfileCode, GenerationProfile> {
  const fallback = defaultGenerationProfiles("default");
  return {
    standard: profiles.find((profile) => profile.code === "standard") ?? fallback[0],
    native: profiles.find((profile) => profile.code === "native") ?? fallback[1],
    pattern: profiles.find((profile) => profile.code === "pattern") ?? fallback[2],
  };
}

export function profileDisplayName(code: GenerationProfileCode): string {
  return defaults[code].name;
}

export function profileOrder(code: GenerationProfileCode): number {
  return profileDisplayOrder.indexOf(code);
}

export const expressionPatternDefinitions: Array<{
  code: Exclude<VariantPatternCode, "default">;
  label: string;
  instruction: string;
}> = [
  { code: "a", label: "03a_文法展開", instruction: "助動詞・時制・否定・疑問など別の文法構造で意図を表す" },
  { code: "b", label: "03b_熟語・句動詞", instruction: "自然な熟語・句動詞を使った完成英文にする" },
  { code: "c", label: "03c_コロケーション", instruction: "コーパス上一般的な語の組み合わせを使った完成英文にする" },
];

export function expressionPatternDisplayName(code: Exclude<VariantPatternCode, "default">): string {
  return expressionPatternDefinitions.find((pattern) => pattern.code === code)?.label ?? `03${code}`;
}

export function variantDisplayName(
  profileCode: GenerationProfileCode,
  patternCode: VariantPatternCode,
): string {
  if (profileCode === "pattern" && patternCode !== "default") {
    return expressionPatternDisplayName(patternCode);
  }
  return profileDisplayName(profileCode);
}
