import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "csv-parse/sync";

export type LevelCode = "L1" | "L2" | "L3" | "L4";

export type PracticeLevel = {
  level: LevelCode;
  levelName: string;
  constraints?: string;
  modelAnswerEn: string;
  modelAnswerJa: string;
  reviewPoints?: string;
  focus?: string;
};

export type PracticeItem = {
  id: string;
  category: string;
  sceneJa: string;
  promptJa: string;
  promptEn: string;
  tags: string[];
  levels: PracticeLevel[];
};

export type VocabularyItem = {
  term: string;
  partOfSpeech: string;
  meaningJa: string;
  exampleEn: string;
  exampleJa: string;
  tags: string[];
};

export type LearningData = {
  topicCards: PracticeItem[];
  diaryPrompts: PracticeItem[];
  vocabulary: VocabularyItem[];
  categories: string[];
  diaryCategories: string[];
};

type TopicCardRow = {
  card_id: string;
  category: string;
  scene_ja: string;
  prompt_en: string;
  prompt_ja: string;
  level: LevelCode;
  level_name: string;
  constraints: string;
  model_answer_en: string;
  model_answer_ja: string;
  review_points: string;
  tags: string;
};

type DiaryPromptRow = {
  prompt_id: string;
  category: string;
  prompt_ja: string;
  prompt_en: string;
  level: LevelCode;
  model_answer_en: string;
  model_answer_ja: string;
  focus: string;
};

type VocabularyRow = {
  term: string;
  part_of_speech: string;
  meaning_ja: string;
  example_en: string;
  example_ja: string;
  tags: string;
};

const levelOrder: LevelCode[] = ["L1", "L2", "L3", "L4"];

async function readCsv<T>(fileName: string) {
  const filePath = path.join(process.cwd(), "data", fileName);
  const source = await readFile(filePath, "utf8");

  return parse(source, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as T[];
}

function splitTags(tags: string | undefined) {
  return (tags || "")
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function sortLevels(levels: PracticeLevel[]) {
  return levels.sort(
    (a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level),
  );
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function groupTopicCards(rows: TopicCardRow[]) {
  const cards = new Map<string, PracticeItem>();

  for (const row of rows) {
    const existing = cards.get(row.card_id);
    const item =
      existing ??
      ({
        id: row.card_id,
        category: row.category,
        sceneJa: row.scene_ja,
        promptJa: row.prompt_ja,
        promptEn: row.prompt_en,
        tags: splitTags(row.tags),
        levels: [],
      } satisfies PracticeItem);

    item.levels.push({
      level: row.level,
      levelName: row.level_name,
      constraints: row.constraints,
      modelAnswerEn: row.model_answer_en,
      modelAnswerJa: row.model_answer_ja,
      reviewPoints: row.review_points,
    });

    cards.set(row.card_id, item);
  }

  return Array.from(cards.values()).map((card) => ({
    ...card,
    levels: sortLevels(card.levels),
  }));
}

function groupDiaryPrompts(rows: DiaryPromptRow[]) {
  const prompts = new Map<string, PracticeItem>();

  for (const row of rows) {
    const existing = prompts.get(row.prompt_id);
    const item =
      existing ??
      ({
        id: row.prompt_id,
        category: row.category,
        sceneJa: row.prompt_ja,
        promptJa: row.prompt_ja,
        promptEn: row.prompt_en,
        tags: [row.category],
        levels: [],
      } satisfies PracticeItem);

    item.levels.push({
      level: row.level,
      levelName: row.level,
      modelAnswerEn: row.model_answer_en,
      modelAnswerJa: row.model_answer_ja,
      focus: row.focus,
    });

    prompts.set(row.prompt_id, item);
  }

  return Array.from(prompts.values()).map((prompt) => ({
    ...prompt,
    levels: sortLevels(prompt.levels),
  }));
}

export async function getLearningData(): Promise<LearningData> {
  const [topicRows, diaryRows, vocabularyRows] = await Promise.all([
    readCsv<TopicCardRow>("topic-cards.csv"),
    readCsv<DiaryPromptRow>("diary-prompts.csv"),
    readCsv<VocabularyRow>("vocabulary.csv"),
  ]);

  const topicCards = groupTopicCards(topicRows);
  const diaryPrompts = groupDiaryPrompts(diaryRows);
  const vocabulary = vocabularyRows.map((row) => ({
    term: row.term,
    partOfSpeech: row.part_of_speech,
    meaningJa: row.meaning_ja,
    exampleEn: row.example_en,
    exampleJa: row.example_ja,
    tags: splitTags(row.tags),
  }));

  return {
    topicCards,
    diaryPrompts,
    vocabulary,
    categories: uniqueSorted(topicCards.map((card) => card.category)),
    diaryCategories: uniqueSorted(diaryPrompts.map((prompt) => prompt.category)),
  };
}
