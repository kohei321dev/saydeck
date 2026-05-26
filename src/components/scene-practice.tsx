"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, RotateCcw, Sparkles } from "lucide-react";

import type { SceneCard } from "@/lib/scenes";

type Props = {
  cards: SceneCard[];
};

type ReviewResult = {
  score: number;
  goodPoint: string;
  fix: string;
  naturalAnswer: string;
  phraseToRemember: string;
  nextPractice: string;
  sceneFit: string;
};

type PracticeState = {
  answer: string;
  isDone: boolean;
  lastPracticedAt: string | null;
  needsReview: boolean;
};

type PracticeStates = Record<string, PracticeState>;

const practiceStorageKey = "scene-builder.practice-state.v1";

export function ScenePractice({ cards }: Props) {
  const [selectedCardId, setSelectedCardId] = useState(cards[0]?.id ?? "");
  const [selectedLevel, setSelectedLevel] = useState("L1");
  const [answer, setAnswer] = useState("");
  const [showModel, setShowModel] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [lastPracticedAt, setLastPracticedAt] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [practiceStates, setPracticeStates] = useState<PracticeStates>({});
  const practiceStatesRef = useRef<PracticeStates>({});
  const [hasLoadedPracticeStates, setHasLoadedPracticeStates] = useState(false);
  const [loadedPracticeKey, setLoadedPracticeKey] = useState("");

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? cards[0],
    [cards, selectedCardId],
  );

  const selectedLevelData =
    selectedCard?.levels.find((level) => level.level === selectedLevel) ??
    selectedCard?.levels[0];

  const selectedPracticeKey =
    selectedCard && selectedLevelData
      ? getPracticeKey(selectedCard.id, selectedLevelData.level)
      : "";

  const formattedLastPracticedAt = formatLastPracticedAt(lastPracticedAt);

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    setPracticeStates(readPracticeStates());
    setHasLoadedPracticeStates(true);
  }, []);

  useEffect(() => {
    practiceStatesRef.current = practiceStates;
  }, [practiceStates]);

  useEffect(() => {
    if (!hasLoadedPracticeStates || !selectedPracticeKey) {
      return;
    }

    const savedState = practiceStatesRef.current[selectedPracticeKey];
    setAnswer(savedState?.answer ?? "");
    setIsDone(savedState?.isDone ?? false);
    setNeedsReview(savedState?.needsReview ?? false);
    setLastPracticedAt(savedState?.lastPracticedAt ?? null);
    setShowModel(false);
    setReview(null);
    setReviewError(null);
    setLoadedPracticeKey(selectedPracticeKey);
  }, [hasLoadedPracticeStates, selectedPracticeKey]);

  useEffect(() => {
    if (
      !hasLoadedPracticeStates ||
      !selectedPracticeKey ||
      loadedPracticeKey !== selectedPracticeKey
    ) {
      return;
    }

    const nextState: PracticeState = {
      answer,
      isDone,
      lastPracticedAt,
      needsReview,
    };

    setPracticeStates((current) => {
      const nextStates = { ...current };

      if (!hasMeaningfulPracticeState(nextState)) {
        delete nextStates[selectedPracticeKey];
      } else {
        nextStates[selectedPracticeKey] = nextState;
      }

      if (arePracticeStatesEqual(current, nextStates)) {
        return current;
      }

      return nextStates;
    });
  }, [
    answer,
    hasLoadedPracticeStates,
    isDone,
    lastPracticedAt,
    loadedPracticeKey,
    needsReview,
    selectedPracticeKey,
  ]);

  useEffect(() => {
    if (!hasLoadedPracticeStates) {
      return;
    }

    writePracticeStates(practiceStates);
  }, [hasLoadedPracticeStates, practiceStates]);

  async function handleAiReview() {
    if (!selectedCard || !selectedLevelData) {
      return;
    }

    const trimmedAnswer = answer.trim();

    if (!trimmedAnswer) {
      setReview(null);
      setReviewError("添削する回答を入力してください。");
      return;
    }

    setIsReviewing(true);
    setReviewError(null);
    setReview(null);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answer: trimmedAnswer,
          cardId: selectedCard.id,
          level: selectedLevelData.level,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        review?: ReviewResult;
      };

      if (!response.ok || !payload.review) {
        throw new Error(payload.error || "AI添削に失敗しました。");
      }

      setReview(payload.review);
      setLastPracticedAt(new Date().toISOString());
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : "AI添削に失敗しました。",
      );
    } finally {
      setIsReviewing(false);
    }
  }

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
              const nextLevel = card.levels[0]?.level ?? "L1";
              setSelectedCardId(card.id);
              setSelectedLevel(nextLevel);
            }}
          >
            <span>{card.sceneJa}</span>
            <div className="scene-list-meta">
              <small>{card.category}</small>
              <SceneProgress card={card} states={practiceStates} />
            </div>
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
                  setReview(null);
                  setReviewError(null);
                }}
              >
                {level.level}
              </button>
            ))}
          </div>

          <div className="level-detail">
            <h2>{selectedLevelData?.name}</h2>
            <p>{selectedLevelData?.constraints}</p>
            <div className="practice-meta">
              <span>{formattedLastPracticedAt ?? "この難易度は未練習"}</span>
              {isDone ? <span className="status-pill done">完了</span> : null}
              {needsReview ? <span className="status-pill review">要復習</span> : null}
            </div>
          </div>

          <label className="answer-label" htmlFor="answer">
            自分の回答
          </label>
          <textarea
            id="answer"
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
              setLastPracticedAt(new Date().toISOString());
              setReviewError(null);
            }}
            placeholder="例: I practiced ollies today."
            rows={7}
          />

          <div className="action-row">
            <span>{wordCount} words</span>
            <div>
              <label className="review-toggle">
                <input
                  checked={needsReview}
                  onChange={(event) => {
                    setNeedsReview(event.target.checked);
                    setLastPracticedAt(new Date().toISOString());
                  }}
                  type="checkbox"
                />
                要復習
              </label>
              <button
                className="secondary-button"
                onClick={() => {
                  setAnswer("");
                  setShowModel(false);
                  setIsDone(false);
                  setNeedsReview(false);
                  setLastPracticedAt(null);
                  setReview(null);
                  setReviewError(null);
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
              <button
                className="secondary-button"
                disabled={isReviewing}
                onClick={handleAiReview}
              >
                <Sparkles aria-hidden="true" size={16} />
                {isReviewing ? "添削中" : "AI添削"}
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setIsDone(true);
                  setLastPracticedAt(new Date().toISOString());
                }}
              >
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

          {reviewError ? <div className="error-note">{reviewError}</div> : null}

          {review ? (
            <div className="ai-review">
              <div className="review-heading">
                <h3>AI添削</h3>
                <span>{review.score}/10</span>
              </div>
              <dl>
                <div>
                  <dt>よい点</dt>
                  <dd>{review.goodPoint}</dd>
                </div>
                <div>
                  <dt>修正文</dt>
                  <dd>{review.fix}</dd>
                </div>
                <div>
                  <dt>自然な言い方</dt>
                  <dd>{review.naturalAnswer}</dd>
                </div>
                <div>
                  <dt>覚える表現</dt>
                  <dd>{review.phraseToRemember}</dd>
                </div>
                <div>
                  <dt>場面との合い方</dt>
                  <dd>{review.sceneFit}</dd>
                </div>
                <div>
                  <dt>次の練習</dt>
                  <dd>{review.nextPractice}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {isDone ? (
            <div className="done-note">
              この回答はlocalStorageに保存されています。同じブラウザでカードと難易度を開くと復元されます。
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function SceneProgress({
  card,
  states,
}: {
  card: SceneCard;
  states: PracticeStates;
}) {
  const cardStates = card.levels
    .map((level) => states[getPracticeKey(card.id, level.level)])
    .filter(Boolean);
  const doneCount = cardStates.filter((state) => state.isDone).length;
  const hasReview = cardStates.some((state) => state.needsReview);

  if (doneCount === 0 && !hasReview) {
    return null;
  }

  return (
    <span className="scene-list-status">
      {doneCount > 0 ? <span>{doneCount}/{card.levels.length} 完了</span> : null}
      {hasReview ? <span>要復習</span> : null}
    </span>
  );
}

function getPracticeKey(cardId: string, level: string): string {
  return `${cardId}:${level}`;
}

function readPracticeStates(): PracticeStates {
  try {
    const rawValue = window.localStorage.getItem(practiceStorageKey);

    if (!rawValue) {
      return {};
    }

    return normalizePracticeStates(JSON.parse(rawValue));
  } catch {
    return {};
  }
}

function writePracticeStates(states: PracticeStates) {
  try {
    if (Object.keys(states).length === 0) {
      window.localStorage.removeItem(practiceStorageKey);
      return;
    }

    window.localStorage.setItem(practiceStorageKey, JSON.stringify(states));
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}

function normalizePracticeStates(value: unknown): PracticeStates {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, state]) => [key, normalizePracticeState(state)] as const)
      .filter((entry): entry is [string, PracticeState] => Boolean(entry[1])),
  );
}

function normalizePracticeState(value: unknown): PracticeState | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    answer: typeof value.answer === "string" ? value.answer : "",
    isDone: value.isDone === true,
    lastPracticedAt:
      typeof value.lastPracticedAt === "string" ? value.lastPracticedAt : null,
    needsReview: value.needsReview === true,
  };
}

function hasMeaningfulPracticeState(state: PracticeState): boolean {
  return Boolean(
    state.answer.trim() || state.isDone || state.needsReview || state.lastPracticedAt,
  );
}

function arePracticeStatesEqual(
  current: PracticeStates,
  next: PracticeStates,
): boolean {
  return JSON.stringify(current) === JSON.stringify(next);
}

function formatLastPracticedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `最終練習: ${new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
