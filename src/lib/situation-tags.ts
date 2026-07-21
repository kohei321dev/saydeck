export const situationTagPool = [
  "友人への返信",
  "家族との連絡",
  "近況の共有",
  "約束・予定調整",
  "遅刻・欠席の連絡",
  "謝罪・お礼",
  "招待・誘い",
  "SNS・DM",
  "電話・ビデオ通話",
  "買い物",
  "飲食店",
  "移動・道案内",
  "旅行",
  "仕事の連絡",
  "体調・休養",
  "自宅・家事",
  "天気・季節",
  "趣味の会話",
  "スケートパーク",
  "セッションの誘い",
  "トリック練習",
  "成功・失敗の共有",
  "順番待ち・譲り合い",
  "スポット・路面",
  "ボード・道具",
  "撮影・動画",
  "怪我・安全",
  "天候・コンディション",
  "上達・アドバイス",
  "スケーターとの会話",
] as const;

const pool = new Set<string>(situationTagPool);

export function normalizeSituationTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map(normalizeTag)
    .filter(Boolean);
  const unique = Array.from(new Set(tags));
  const preferred = unique.filter((tag) => pool.has(tag));
  const generated = unique.filter((tag) => !pool.has(tag));

  return [...preferred, ...generated].slice(0, 3);
}

export function primarySituationTag(tags: string[]): string {
  return normalizeSituationTags(tags)[0] ?? "未分類";
}

export function deckSituationTag(tags: string[]): string {
  return primarySituationTag(tags)
    .replace(/::/g, "・")
    .replace(/\s+/g, " ")
    .slice(0, 48) || "未分類";
}

export function situationTagPoolPrompt(): string {
  return situationTagPool.join("、");
}

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 48);
}
