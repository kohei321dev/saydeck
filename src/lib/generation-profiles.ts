import type { GenerationProfile, GenerationProfileCode } from "@/lib/expression-types";

type DefaultProfile = Omit<GenerationProfile, "ownerLogin" | "createdAt" | "updatedAt">;

const defaults: Record<GenerationProfileCode, DefaultProfile> = {
  basic: {
    code: "basic",
    name: "01_基本表現",
    minWords: 2,
    maxWords: 20,
    maxSentences: 2,
    requiredFeatures: ["required", "standard_grammar", "direct"],
    instruction: "必須。標準的な文法で、意図を最も直接的かつ自然に伝える再利用しやすい表現にする。",
  },
  detail: {
    code: "detail",
    name: "02_詳細表現",
    minWords: 3,
    maxWords: 26,
    maxSentences: 2,
    requiredFeatures: ["optional", "meaningful_detail"],
    instruction: "任意。基本表現に、状況を理解するうえで役立つ具体的な情報を加える場合だけ生成する。",
  },
  conversation: {
    code: "conversation",
    name: "03_会話表現",
    minWords: 2,
    maxWords: 26,
    maxSentences: 2,
    requiredFeatures: ["optional", "spoken", "conversational"],
    instruction: "任意。口語、省略、問いかけなど、会話として基本表現と明確に異なる自然な言い方がある場合だけ生成する。",
  },
  natural_alternative: {
    code: "natural_alternative",
    name: "04_別の自然な言い方",
    minWords: 2,
    maxWords: 26,
    maxSentences: 2,
    requiredFeatures: ["optional", "alternative_framing"],
    instruction: "任意。同じ意図を別の構文や視点で自然に表せる場合だけ生成する。単なる同義語の置換は生成しない。",
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
