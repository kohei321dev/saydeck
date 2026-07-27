import type { GenerationProfile, GenerationProfileCode, VariantPatternCode } from "@/lib/expression-types";

type DefaultProfile = Omit<GenerationProfile, "ownerLogin" | "createdAt" | "updatedAt">;

const defaults: Record<GenerationProfileCode, DefaultProfile> = {
  basic: {
    code: "basic",
    name: "01_基本表現",
    minWords: 2,
    maxWords: 12,
    maxSentences: 1,
    requiredFeatures: ["required", "standard_grammar", "single_speech_act", "minimal_information"],
    instruction: "必須。1文・原則12語以内で、1つの発話行為だけを標準的な語順で伝える最小の表現にする。条件節、仮定、理由、数量、間接的な依頼・丁寧な緩和表現は入れない。複数の内容がある入力は意味単位に分け、基本表現へ詰め込まない。",
  },
  detail: {
    code: "detail",
    name: "02_詳細表現",
    minWords: 3,
    maxWords: 18,
    maxSentences: 1,
    requiredFeatures: ["optional", "meaningful_detail", "patterned_detail"],
    instruction: "任意。基本表現を土台に、1文・18語以内で適用できる02a〜02eの文法・語句パターンだけを生成する。基本表現の単なる長文化や水増しは避ける。",
  },
  conversation: {
    code: "conversation",
    name: "03_会話表現",
    minWords: 2,
    maxWords: 26,
    maxSentences: 2,
    requiredFeatures: ["optional", "spoken", "conversational"],
    instruction: "任意。口語、省略、くだけた言い回しなど、会話として基本表現と明確に異なる自然な言い方がある場合だけ生成する。短くてもよく、基本表現より難しいことを要件にしない。",
  },
  natural_alternative: {
    code: "natural_alternative",
    name: "04_ネイティブ表現",
    minWords: 2,
    maxWords: 26,
    maxSentences: 2,
    requiredFeatures: ["optional", "alternative_framing"],
    instruction: "任意。同じ意図をネイティブ話者が使う自然な定型句・省略・別構文で表せる場合だけ生成する。単なる同義語の置換や不自然なスラングは生成しない。",
  },
};

export const profileDisplayOrder: GenerationProfileCode[] = [
  "basic",
  "detail",
  "conversation",
  "natural_alternative",
];

export function defaultGenerationProfiles(ownerLogin: string): GenerationProfile[] {
  const now = new Date().toISOString();
  return (Object.values(defaults) as DefaultProfile[]).map((profile) => ({ ...profile, ownerLogin, createdAt: now, updatedAt: now }));
}

export function profileByCode(profiles: GenerationProfile[]): Record<GenerationProfileCode, GenerationProfile> {
  const fallback = defaultGenerationProfiles("default");
  return {
    basic: profiles.find((profile) => profile.code === "basic") ?? fallback[0],
    detail: profiles.find((profile) => profile.code === "detail") ?? fallback[1],
    conversation: profiles.find((profile) => profile.code === "conversation") ?? fallback[2],
    natural_alternative: profiles.find((profile) => profile.code === "natural_alternative") ?? fallback[3],
  };
}

export function profileDisplayName(code: GenerationProfileCode): string {
  return defaults[code].name;
}

export function profileOrder(code: GenerationProfileCode): number {
  return profileDisplayOrder.indexOf(code);
}

export const detailPatternDefinitions: Array<{
  code: Exclude<VariantPatternCode, "default">;
  label: string;
  instruction: string;
}> = [
  { code: "a", label: "02a_形容詞・補語", instruction: "形容詞や補語で状態・評価を具体化する" },
  { code: "b", label: "02b_副詞・程度", instruction: "副詞や程度表現で頻度・強さ・態度を加える" },
  { code: "c", label: "02c_前置詞句", instruction: "場所・対象・関係を前置詞句で自然に加える" },
  { code: "d", label: "02d_熟語・定型結合", instruction: "句動詞・熟語・コロケーションへ展開する" },
  { code: "e", label: "02e_文法展開", instruction: "助動詞・否定・疑問・時制など別の文法構造で展開する" },
];

export function detailPatternDisplayName(code: Exclude<VariantPatternCode, "default">): string {
  return detailPatternDefinitions.find((pattern) => pattern.code === code)?.label ?? `02${code}`;
}

export function variantDisplayName(
  profileCode: GenerationProfileCode,
  patternCode: VariantPatternCode,
): string {
  if (profileCode === "detail" && patternCode !== "default") {
    return detailPatternDisplayName(patternCode);
  }
  return profileDisplayName(profileCode);
}
