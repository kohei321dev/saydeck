"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import type { RuntimeDiagnostics } from "@/lib/runtime-diagnostics";
import type { SceneCard } from "@/lib/scenes";

type Props = {
  cardPersistenceConfigured?: boolean;
  canAddCards?: boolean;
  canUseCloudSync?: boolean;
  cards: SceneCard[];
  persistedCardIds?: string[];
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

type CloudSyncStatus = "local" | "loading" | "saving" | "saved" | "error";

type CloudPracticeResponse = {
  record?: PracticeState | null;
  error?: string;
};

const practiceStorageKey = "scene-builder.practice-state.v1";

/**
 * Render the scene practice UI with local persistence, optional cloud sync,
 * AI-assisted card generation, and AI review features.
 *
 * @param canAddCards - When true, enables creating, persisting, and deleting custom cards (default: `false`).
 * @param canUseCloudSync - When true, enables cloud-backed loading and debounced saving of practice state (default: `false`).
 * @param cards - The initial list of scene cards available for practice.
 * @returns The React element for the ScenePractice user interface.
 */
export function ScenePractice({
  cardPersistenceConfigured = false,
  canAddCards = false,
  canUseCloudSync = false,
  cards,
  persistedCardIds = [],
}: Props) {
  const [customCards, setCustomCards] = useState<SceneCard[]>([]);
  const [deletedCardIds, setDeletedCardIds] = useState<string[]>([]);
  const [savedCardIds, setSavedCardIds] = useState<string[]>([]);
  const allCards = useMemo(
    () =>
      mergeClientSceneCards(
        cards.filter((card) => !deletedCardIds.includes(card.id)),
        customCards.filter((card) => !deletedCardIds.includes(card.id)),
      ),
    [cards, customCards, deletedCardIds],
  );
  const persistedCardIdSet = useMemo(
    () => new Set([...persistedCardIds, ...savedCardIds]),
    [persistedCardIds, savedCardIds],
  );
  const [selectedCardId, setSelectedCardId] = useState(allCards[0]?.id ?? "");
  const [selectedLevel, setSelectedLevel] = useState("L1");
  const [answer, setAnswer] = useState("");
  const [newCardCategory, setNewCardCategory] = useState("custom");
  const [newCardSceneJa, setNewCardSceneJa] = useState("");
  const [newCardTags, setNewCardTags] = useState("");
  const [cardGenerationError, setCardGenerationError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
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
  const [cloudReadyKey, setCloudReadyKey] = useState("");
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(
    canUseCloudSync ? "loading" : "local",
  );

  const selectedCard = useMemo(
    () => allCards.find((card) => card.id === selectedCardId) ?? allCards[0],
    [allCards, selectedCardId],
  );

  const selectedLevelData =
    selectedCard?.levels.find((level) => level.level === selectedLevel) ??
    selectedCard?.levels[0];

  const selectedPracticeKey =
    selectedCard && selectedLevelData
      ? getPracticeKey(selectedCard.id, selectedLevelData.level)
      : "";
  const selectedCloudCardId = selectedCard?.id ?? "";
  const selectedCloudLevel = selectedLevelData?.level ?? "";

  const formattedLastPracticedAt = formatLastPracticedAt(lastPracticedAt);
  const cloudSyncLabel = getCloudSyncLabel(cloudSyncStatus);
  const doneNote = getDoneNote(canUseCloudSync, cloudSyncStatus);

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    if (!canAddCards) {
      setCustomCards([]);
    }
  }, [canAddCards]);

  useEffect(() => {
    const selectedCardExists = allCards.some((card) => card.id === selectedCardId);

    if ((!selectedCardId || !selectedCardExists) && allCards[0]) {
      setSelectedCardId(allCards[0].id);
    }
  }, [allCards, selectedCardId]);

  useEffect(() => {
    setPracticeStates(readPracticeStates());
    setHasLoadedPracticeStates(true);
  }, []);

  useEffect(() => {
    practiceStatesRef.current = practiceStates;
  }, [practiceStates]);

  useEffect(() => {
    if (
      !hasLoadedPracticeStates ||
      !selectedPracticeKey ||
      !selectedCloudCardId ||
      !selectedCloudLevel
    ) {
      return;
    }

    let isCancelled = false;
    const savedState = practiceStatesRef.current[selectedPracticeKey];
    const applyPracticeState = (state?: PracticeState | null) => {
      setAnswer(state?.answer ?? "");
      setIsDone(state?.isDone ?? false);
      setNeedsReview(state?.needsReview ?? false);
      setLastPracticedAt(state?.lastPracticedAt ?? null);
    };

    applyPracticeState(savedState);
    setShowModel(false);
    setReview(null);
    setReviewError(null);
    setLoadedPracticeKey(selectedPracticeKey);
    setCloudReadyKey("");

    if (!canUseCloudSync) {
      setCloudSyncStatus("local");
      return;
    }

    setCloudSyncStatus("loading");

    const params = new URLSearchParams({
      cardId: selectedCloudCardId,
      level: selectedCloudLevel,
    });

    fetch(`/api/practice?${params.toString()}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as CloudPracticeResponse;

        if (!response.ok) {
          throw new Error(payload.error || "クラウド保存の読み込みに失敗しました。");
        }

        if (isCancelled) {
          return;
        }

        if (payload.record) {
          applyPracticeState(payload.record);
        }

        setCloudReadyKey(selectedPracticeKey);
        setCloudSyncStatus("saved");
      })
      .catch(() => {
        if (!isCancelled) {
          setCloudReadyKey(selectedPracticeKey);
          setCloudSyncStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    canUseCloudSync,
    hasLoadedPracticeStates,
    selectedCloudCardId,
    selectedCloudLevel,
    selectedPracticeKey,
  ]);

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

  useEffect(() => {
    if (
      !canUseCloudSync ||
      !selectedPracticeKey ||
      !selectedCloudCardId ||
      !selectedCloudLevel ||
      loadedPracticeKey !== selectedPracticeKey ||
      cloudReadyKey !== selectedPracticeKey
    ) {
      return;
    }

    const controller = new AbortController();
    const timerId = window.setTimeout(() => {
      setCloudSyncStatus("saving");

      fetch("/api/practice", {
        body: JSON.stringify({
          answer,
          cardId: selectedCloudCardId,
          isDone,
          lastPracticedAt,
          level: selectedCloudLevel,
          needsReview,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as CloudPracticeResponse;

          if (!response.ok) {
            throw new Error(payload.error || "クラウド保存に失敗しました。");
          }

          setCloudSyncStatus("saved");
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setCloudSyncStatus("error");
          }
        });
    }, 700);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [
    answer,
    canUseCloudSync,
    cloudReadyKey,
    isDone,
    lastPracticedAt,
    loadedPracticeKey,
    needsReview,
    selectedCloudCardId,
    selectedCloudLevel,
    selectedPracticeKey,
  ]);

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

  async function handleGenerateCard() {
    const trimmedScene = newCardSceneJa.trim();

    if (!trimmedScene) {
      setCardGenerationError("シチュエーションを入力してください。");
      return;
    }

    setIsGeneratingCard(true);
    setCardGenerationError(null);

    try {
      const response = await fetch("/api/cards/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: newCardCategory.trim() || "custom",
          sceneJa: trimmedScene,
          tags: parseTags(newCardTags),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        card?: SceneCard;
        error?: string;
        persistence?: {
          configured?: boolean;
          saved?: boolean;
        };
      };

      if (!response.ok || !payload.card) {
        throw new Error(payload.error || "カード生成に失敗しました。");
      }

      const generatedCard = payload.card as SceneCard;
      setCustomCards((current) => mergeClientSceneCards(current, [generatedCard]));

      if (payload.persistence?.saved) {
        setSavedCardIds((current) =>
          current.includes(generatedCard.id) ? current : [...current, generatedCard.id],
        );
      }

      setDeletedCardIds((current) =>
        current.filter((cardId) => cardId !== generatedCard.id),
      );
      setSelectedCardId(generatedCard.id);
      setSelectedLevel(generatedCard.levels[0]?.level ?? "L1");
      setNewCardSceneJa("");
      setNewCardTags("");
    } catch (error) {
      setCardGenerationError(
        error instanceof Error ? error.message : "カード生成に失敗しました。",
      );
    } finally {
      setIsGeneratingCard(false);
    }
  }

  async function handleDeleteCustomCard(cardId: string) {
    const isPersistedCard = persistedCardIdSet.has(cardId);
    const remainingCards = allCards.filter((card) => card.id !== cardId);

    if (isPersistedCard && cardPersistenceConfigured) {
      try {
        const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "カード削除に失敗しました。");
        }
      } catch (error) {
        setCardGenerationError(
          error instanceof Error ? error.message : "カード削除に失敗しました。",
        );
        return;
      }
    }

    const nextCards = customCards.filter((card) => card.id !== cardId);
    setCustomCards(nextCards);
    setSavedCardIds((current) =>
      current.filter((savedCardId) => savedCardId !== cardId),
    );
    setDeletedCardIds((current) =>
      current.includes(cardId) ? current : [...current, cardId],
    );
    setCardGenerationError(null);

    if (selectedCardId === cardId) {
      const nextSelectedCard = remainingCards[0];
      setSelectedCardId(nextSelectedCard?.id ?? "");
      setSelectedLevel(nextSelectedCard?.levels[0]?.level ?? "L1");
    }
  }

  async function handleLoadDiagnostics() {
    setIsLoadingDiagnostics(true);
    setDiagnosticsError(null);

    try {
      const response = await fetch("/api/diagnostics");
      const payload = (await response.json().catch(() => ({}))) as {
        diagnostics?: RuntimeDiagnostics;
        error?: string;
      };

      if (!response.ok || !payload.diagnostics) {
        throw new Error(payload.error || "診断情報の取得に失敗しました。");
      }

      setDiagnostics(payload.diagnostics);
    } catch (error) {
      setDiagnosticsError(
        error instanceof Error ? error.message : "診断情報の取得に失敗しました。",
      );
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }

  return (
    <div className="practice-shell">
      <aside className="scene-list" aria-label="シーン一覧">
        <div className="sidebar-heading">
          <span>Scenes</span>
          <span>{allCards.length}</span>
        </div>
        {canAddCards ? (
          <div className="card-builder">
            <div className="card-builder-heading">
              <Plus aria-hidden="true" size={16} />
              <span>カード追加</span>
            </div>
            <label>
              <span>シチュエーション</span>
              <textarea
                onChange={(event) => {
                  setNewCardSceneJa(event.target.value);
                  setCardGenerationError(null);
                }}
                placeholder="例: 外国人の友達に今日の練習メニューを話す"
                rows={4}
                value={newCardSceneJa}
              />
            </label>
            <label>
              <span>カテゴリ</span>
              <input
                onChange={(event) => setNewCardCategory(event.target.value)}
                value={newCardCategory}
              />
            </label>
            <label>
              <span>タグ</span>
              <input
                onChange={(event) => setNewCardTags(event.target.value)}
                placeholder="practice;friend"
                value={newCardTags}
              />
            </label>
            <button
              className="primary-button"
              disabled={isGeneratingCard}
              onClick={handleGenerateCard}
            >
              <Sparkles aria-hidden="true" size={16} />
              {isGeneratingCard ? "生成中" : "AIで作成"}
            </button>
            {cardGenerationError ? (
              <div className="error-note compact">{cardGenerationError}</div>
            ) : null}
            <div className="diagnostics-panel">
              <button
                className="secondary-button"
                disabled={isLoadingDiagnostics}
                onClick={handleLoadDiagnostics}
              >
                <ShieldCheck aria-hidden="true" size={16} />
                {isLoadingDiagnostics ? "確認中" : "設定診断"}
              </button>
              {diagnosticsError ? (
                <div className="error-note compact">{diagnosticsError}</div>
              ) : null}
              {diagnostics ? <DiagnosticsSummary diagnostics={diagnostics} /> : null}
            </div>
          </div>
        ) : null}
        {allCards.map((card) => {
          const isCustomCard =
            persistedCardIdSet.has(card.id) ||
            customCards.some((customCard) => customCard.id === card.id);

          return (
            <div className="scene-list-entry" key={card.id}>
              <button
                className={
                  card.id === selectedCard?.id
                    ? "scene-list-item active"
                    : "scene-list-item"
                }
                onClick={() => {
                  const nextLevel = card.levels[0]?.level ?? "L1";
                  setSelectedCardId(card.id);
                  setSelectedLevel(nextLevel);
                }}
              >
                <span>{card.sceneJa}</span>
                <div className="scene-list-meta">
                  <small>{isCustomCard ? `${card.category} / custom` : card.category}</small>
                  <SceneProgress card={card} states={practiceStates} />
                </div>
              </button>
              {canAddCards && isCustomCard ? (
                <button
                  aria-label={`${card.sceneJa}を削除`}
                  className="icon-button danger"
                  onClick={() => handleDeleteCustomCard(card.id)}
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              ) : null}
            </div>
          );
        })}
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
              <span className={`status-pill sync ${cloudSyncStatus}`}>
                {cloudSyncLabel}
              </span>
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
              {doneNote}
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

/**
 * Render a diagnostics summary listing service readiness and configuration values.
 *
 * @param diagnostics - Runtime diagnostics snapshot used to populate readiness rows and configuration fields
 * @returns A JSX element containing a definition list of readiness indicators (Auth, GitHub, Google, Database, AI key) and related values (model, reasoning effort, NEXTAUTH_URL host)
 */
function DiagnosticsSummary({
  diagnostics,
}: {
  diagnostics: RuntimeDiagnostics;
}) {
  return (
    <div className="diagnostics-summary">
      <dl>
        <DiagnosticsRow isReady={diagnostics.auth.configured} label="Auth" />
        <DiagnosticsRow
          isReady={diagnostics.auth.githubConfigured}
          label="GitHub"
        />
        <DiagnosticsRow
          isReady={diagnostics.auth.googleConfigured}
          label="Google"
        />
        <DiagnosticsRow isReady={diagnostics.database.configured} label="Database" />
        <DiagnosticsRow isReady={diagnostics.ai.apiKeyConfigured} label="AI key" />
        <DiagnosticsRow
          isReady={
            diagnostics.cards.persistenceConfigured && diagnostics.cards.schemaReady
          }
          label="Storage"
        />
        <div>
          <dt>Model</dt>
          <dd>{diagnostics.ai.model}</dd>
        </div>
        <div>
          <dt>Reasoning</dt>
          <dd>{diagnostics.ai.reasoningEffort}</dd>
        </div>
        <div>
          <dt>NEXTAUTH_URL</dt>
          <dd>{diagnostics.auth.nextAuthUrlHost ?? "未設定"}</dd>
        </div>
        <div>
          <dt>Card store</dt>
          <dd>{diagnostics.cards.storeLocation}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Renders a labeled status row that displays readiness as "OK" or "未設定".
 *
 * @param isReady - Whether the item is ready; controls text and CSS class.
 * @param label - The label text shown for the row.
 * @returns A definition-row element (`<dt>`/`<dd>`) with a readiness pill styled via `"ok"` or `"warn"`.
 */
function DiagnosticsRow({
  isReady,
  label,
}: {
  isReady: boolean;
  label: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={isReady ? "ok" : "warn"}>{isReady ? "OK" : "未設定"}</dd>
    </div>
  );
}

/**
 * Map a cloud synchronization status to a Japanese label for UI display.
 *
 * @param status - The cloud sync status to describe (`"local" | "loading" | "saving" | "saved" | "error"`).
 * @returns A Japanese string label corresponding to `status` (e.g. "Cloud 保存中", "Local 保存").
 */
function getCloudSyncLabel(status: CloudSyncStatus): string {
  switch (status) {
    case "loading":
      return "Cloud 読込中";
    case "saving":
      return "Cloud 保存中";
    case "saved":
      return "Cloud 保存済み";
    case "error":
      return "Cloud 未同期";
    case "local":
    default:
      return "Local 保存";
  }
}

/**
 * Selects the user-facing note that explains where the current answer is stored based on cloud sync availability and status.
 *
 * @param canUseCloudSync - Whether cloud-backed syncing is enabled
 * @param status - Current cloud synchronization status
 * @returns A Japanese message indicating storage location/status: local-only, cloud saved (with local backup), cloud saving in progress (with local backup), or cloud save failure (fallback to local)
 */
function getDoneNote(canUseCloudSync: boolean, status: CloudSyncStatus): string {
  if (!canUseCloudSync) {
    return "この回答はlocalStorageに保存されています。同じブラウザでカードと難易度を開くと復元されます。";
  }

  if (status === "error") {
    return "クラウド保存に失敗したため、この回答はlocalStorageに保存されています。";
  }

  if (status === "loading" || status === "saving") {
    return "この回答はクラウド保存中です。localStorageにもバックアップしています。";
  }

  return "この回答はNeon/Postgresに保存されています。localStorageにもバックアップしています。";
}

/**
 * Builds the practice-state key for a given card and level.
 *
 * @param cardId - The card identifier
 * @param level - The practice level identifier (e.g., "L1")
 * @returns The practice-state key formatted as `"{cardId}:{level}"`
 */
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

function mergeClientSceneCards(...cardGroups: SceneCard[][]): SceneCard[] {
  const cards = new Map<string, SceneCard>();

  for (const group of cardGroups) {
    for (const card of group) {
      cards.set(card.id, card);
    }
  }

  return [...cards.values()];
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

function parseTags(value: string): string[] {
  return value.split(";").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
