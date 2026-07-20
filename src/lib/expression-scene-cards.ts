import type { ExpressionEntryDetail } from "@/lib/expression-types";
import type { SceneCard } from "@/lib/scenes";

/**
 * Project registered SayDeck expressions into the legacy learning DTO.
 * The learning UI can therefore adopt new cards without double-writing the
 * old `scene_cards` tables or changing practice history keys.
 */
export function expressionEntriesToSceneCards(
  entries: ExpressionEntryDetail[],
): SceneCard[] {
  return entries
    .filter((entry) => entry.status === "registered")
    .flatMap((entry): SceneCard[] => {
      const variants = entry.sentenceCards
        .flatMap((card) => card.variants ?? [])
        .filter((variant) => variant.isSelected && variant.status !== "archived");

      if (variants.length === 0) {
        return [];
      }

      return [{
        id: entry.id,
        category: entry.genreSlug || "expression",
        sceneJa: entry.inputJa,
        promptEn: variants[0]?.english ?? entry.inputJa,
        promptJa: entry.situationJa || entry.inputJa,
        tags: [...new Set(["saydeck", ...entry.situationTags])].slice(0, 20),
        levels: variants.map((variant) => ({
          level: variant.profileCode,
          name: `SayDeck ${variant.profileCode}`,
          constraints: variant.constraints,
          answerEn: variant.english,
          answerJa: variant.japanese,
          reviewPoints: variant.reviewPoints,
        })),
      }];
    });
}
