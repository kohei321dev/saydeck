import {
  getSampleSceneCards,
  getStoredSceneCards,
} from "@/lib/card-store";

export type SceneCard = {
  id: string;
  source?: "sample" | "owner" | "expression";
  createdAt?: string;
  category: string;
  sceneJa: string;
  promptEn: string;
  promptJa: string;
  tags: string[];
  levels: Array<{
    level: string;
    name: string;
    constraints: string;
    answerEn: string;
    answerJa: string;
    reviewPoints: string;
  }>;
};

export async function getSceneCards(): Promise<SceneCard[]> {
  const [sampleCards, storedCards] = await Promise.all([
    getSampleSceneCards(),
    getStoredSceneCards(),
  ]);

  return mergeSceneCards(sampleCards, storedCards);
}

export function mergeSceneCards(...cardGroups: SceneCard[][]): SceneCard[] {
  const cards = new Map<string, SceneCard>();

  for (const group of cardGroups) {
    for (const card of group) {
      cards.set(card.id, card);
    }
  }

  return [...cards.values()];
}
