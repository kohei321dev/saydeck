import type { GenerationProfile, GenerationProfileCode } from "@/lib/expression-types";

type DefaultProfile = Omit<GenerationProfile, "ownerLogin" | "createdAt" | "updatedAt">;

const defaults: Record<GenerationProfileCode, DefaultProfile> = {
  L1: { code: "L1", name: "Verb focus", minWords: 3, maxWords: 8, maxSentences: 1, requiredFeatures: ["subject", "verb"], instruction: "主語・動詞・必要な補語を中心にした最小限で自然な英文にする。" },
  L2: { code: "L2", name: "Add detail", minWords: 5, maxWords: 14, maxSentences: 2, requiredFeatures: ["detail"], instruction: "形容詞・副詞・状態表現のいずれかで細部を加える。" },
  L3: { code: "L3", name: "Reason", minWords: 8, maxWords: 20, maxSentences: 2, requiredFeatures: ["reason_or_contrast"], instruction: "理由または対比を示す。" },
  L4: { code: "L4", name: "Conversation", minWords: 8, maxWords: 24, maxSentences: 2, requiredFeatures: ["conversation"], instruction: "質問・誘い・確認など会話として自然な要素を含める。" },
};

export function defaultGenerationProfiles(ownerLogin: string): GenerationProfile[] {
  const now = new Date().toISOString();
  return (Object.values(defaults) as DefaultProfile[]).map((profile) => ({ ...profile, ownerLogin, createdAt: now, updatedAt: now }));
}

export function profileByCode(profiles: GenerationProfile[]): Record<GenerationProfileCode, GenerationProfile> {
  const fallback = defaultGenerationProfiles("default");
  return {
    L1: profiles.find((profile) => profile.code === "L1") ?? fallback[0],
    L2: profiles.find((profile) => profile.code === "L2") ?? fallback[1],
    L3: profiles.find((profile) => profile.code === "L3") ?? fallback[2],
    L4: profiles.find((profile) => profile.code === "L4") ?? fallback[3],
  };
}
