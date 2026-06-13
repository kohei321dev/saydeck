import type { SceneCard } from "@/lib/scenes";

export const devSceneCards: SceneCard[] = [
  {
    id: "dev-skate-first-line",
    category: "skate",
    sceneJa: "スケボー場で初めて会った人に話しかける",
    promptEn: "Start a short conversation with someone at the skatepark.",
    promptJa: "スケボー場で初めて会った人に、短く自然に話しかける。",
    tags: ["skate", "greeting", "dev"],
    levels: [
      {
        level: "eiken-3",
        name: "英検3級",
        constraints: "1文から2文。簡単な現在形を使う。",
        answerEn: "Hi, do you come here often? I am practicing ollies today.",
        answerJa: "こんにちは、ここにはよく来ますか。今日はオーリーを練習しています。",
        reviewPoints: "あいさつ、質問、自分の状況を短く入れる。",
      },
      {
        level: "natural",
        name: "自然な会話",
        constraints: "カジュアルで短い英語にする。",
        answerEn: "Hey, are you local? I am working on my ollies today.",
        answerJa: "やあ、この辺の人ですか。今日はオーリーを練習しています。",
        reviewPoints: "local, working on など自然な言い方を使う。",
      },
    ],
  },
  {
    id: "dev-skate-ask-tip",
    category: "skate",
    sceneJa: "技のコツを聞く",
    promptEn: "Ask for one simple tip about a trick.",
    promptJa: "技のコツをひとつだけ聞く。",
    tags: ["skate", "question", "dev"],
    levels: [
      {
        level: "eiken-3",
        name: "英検3級",
        constraints: "Could you を使って丁寧に聞く。",
        answerEn: "Could you give me one tip for this trick?",
        answerJa: "この技のコツをひとつ教えてくれますか。",
        reviewPoints: "Could you give me one tip の形を覚える。",
      },
      {
        level: "natural",
        name: "自然な会話",
        constraints: "短く、相手に聞きやすい表現にする。",
        answerEn: "Any tips for landing this trick?",
        answerJa: "この技を成功させるコツはありますか。",
        reviewPoints: "Any tips for ...? は短く自然に聞ける。",
      },
    ],
  },
  {
    id: "dev-diary-weekend",
    category: "diary",
    sceneJa: "週末にしたことを短く話す",
    promptEn: "Say what you did last weekend and how it felt.",
    promptJa: "週末にしたことと、その感想を短く言う。",
    tags: ["diary", "past", "dev"],
    levels: [
      {
        level: "eiken-3",
        name: "英検3級",
        constraints: "過去形を使って2文で書く。",
        answerEn: "I went skating last weekend. It was fun, but I was tired.",
        answerJa: "先週末スケボーをしました。楽しかったですが、疲れました。",
        reviewPoints: "went, was など基本的な過去形を使う。",
      },
      {
        level: "natural",
        name: "自然な会話",
        constraints: "感想を少し自然に足す。",
        answerEn: "I skated last weekend. It was fun, but my legs were dead.",
        answerJa: "先週末スケボーをしました。楽しかったですが、足がかなり疲れました。",
        reviewPoints: "my legs were dead はかなり疲れたというカジュアルな表現。",
      },
    ],
  },
];
