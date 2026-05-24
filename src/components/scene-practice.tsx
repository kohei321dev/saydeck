"use client";

import { useMemo, useState } from "react";
import { Check, Eye, RotateCcw } from "lucide-react";

import type { SceneCard } from "@/lib/scenes";

type Props = {
  cards: SceneCard[];
};

export function ScenePractice({ cards }: Props) {
  const [selectedCardId, setSelectedCardId] = useState(cards[0]?.id ?? "");
  const [selectedLevel, setSelectedLevel] = useState("L1");
  const [answer, setAnswer] = useState("");
  const [showModel, setShowModel] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? cards[0],
    [cards, selectedCardId],
  );

  const selectedLevelData =
    selectedCard?.levels.find((level) => level.level === selectedLevel) ??
    selectedCard?.levels[0];

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="practice-shell">
      <aside className="scene-list" aria-label="シーン一覧">
        <div className="sidebar-heading">
          <span>Scenes</span>
          <span>{cards.length}</span>
        </div>
        {cards.map((card) => (
          <button
            className={
              card.id === selectedCard?.id ? "scene-list-item active" : "scene-list-item"
            }
            key={card.id}
            onClick={() => {
              setSelectedCardId(card.id);
              setSelectedLevel(card.levels[0]?.level ?? "L1");
              setAnswer("");
              setShowModel(false);
              setIsDone(false);
            }}
          >
            <span>{card.sceneJa}</span>
            <small>{card.category}</small>
          </button>
        ))}
      </aside>

      <main className="practice-main">
        <section className="prompt-panel">
          <div className="prompt-kicker">{selectedCard?.category}</div>
          <h1>{selectedCard?.sceneJa}</h1>
          <p className="prompt-en">{selectedCard?.promptEn}</p>
          <p className="prompt-ja">{selectedCard?.promptJa}</p>
          <div className="tag-row">
            {selectedCard?.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </section>

        <section className="work-panel">
          <div className="level-tabs" aria-label="難易度">
            {selectedCard?.levels.map((level) => (
              <button
                className={level.level === selectedLevel ? "active" : ""}
                key={level.level}
                onClick={() => {
                  setSelectedLevel(level.level);
                  setShowModel(false);
                }}
              >
                {level.level}
              </button>
            ))}
          </div>

          <div className="level-detail">
            <h2>{selectedLevelData?.name}</h2>
            <p>{selectedLevelData?.constraints}</p>
          </div>

          <label className="answer-label" htmlFor="answer">
            自分の回答
          </label>
          <textarea
            id="answer"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="例: I practiced ollies today."
            rows={7}
          />

          <div className="action-row">
            <span>{wordCount} words</span>
            <div>
              <button
                className="secondary-button"
                onClick={() => {
                  setAnswer("");
                  setShowModel(false);
                  setIsDone(false);
                }}
              >
                <RotateCcw aria-hidden="true" size={16} />
                リセット
              </button>
              <button
                className="secondary-button"
                onClick={() => setShowModel((current) => !current)}
              >
                <Eye aria-hidden="true" size={16} />
                模範回答
              </button>
              <button className="primary-button" onClick={() => setIsDone(true)}>
                <Check aria-hidden="true" size={16} />
                完了
              </button>
            </div>
          </div>

          {showModel ? (
            <div className="model-answer">
              <h3>Model answer</h3>
              <p className="model-en">{selectedLevelData?.answerEn}</p>
              <p>{selectedLevelData?.answerJa}</p>
              <small>{selectedLevelData?.reviewPoints}</small>
            </div>
          ) : null}

          {isDone ? (
            <div className="done-note">
              保存は次のMVPでlocalStorage化します。今は1シーンの回答練習と認証導線の確認用です。
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

