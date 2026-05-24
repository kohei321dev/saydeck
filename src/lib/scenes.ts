import { readFile } from "fs/promises";
import path from "path";

import { parse } from "csv-parse/sync";

export type TopicCardRow = {
  card_id: string;
  category: string;
  scene_ja: string;
  prompt_en: string;
  prompt_ja: string;
  level: string;
  level_name: string;
  constraints: string;
  model_answer_en: string;
  model_answer_ja: string;
  review_points: string;
  tags: string;
};

export type SceneCard = {
  id: string;
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
  const filePath = path.join(process.cwd(), "data", "topic-cards.csv");
  const csv = await readFile(filePath, "utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
  }) as TopicCardRow[];

  const cards = new Map<string, SceneCard>();

  for (const row of rows) {
    const existing =
      cards.get(row.card_id) ??
      ({
        id: row.card_id,
        category: row.category,
        sceneJa: row.scene_ja,
        promptEn: row.prompt_en,
        promptJa: row.prompt_ja,
        tags: row.tags.split(";").filter(Boolean),
        levels: [],
      } satisfies SceneCard);

    existing.levels.push({
      level: row.level,
      name: row.level_name,
      constraints: row.constraints,
      answerEn: row.model_answer_en,
      answerJa: row.model_answer_ja,
      reviewPoints: row.review_points,
    });

    cards.set(row.card_id, existing);
  }

  return [...cards.values()].sort((a, b) => a.id.localeCompare(b.id));
}

