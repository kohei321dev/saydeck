"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Eye,
  Flag,
  Lightbulb,
  NotebookTabs,
  PencilLine,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
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
  review: ReviewResult | null;
};

type PracticeStates = Record<string, PracticeState>;

type PracticeAttempt = {
  id: string;
  cardId: string;
  level: string;
  answer: string;
  review: ReviewResult | null;
  score: number | null;
  practicedAt: string;
};

type SavedNote = {
  id: string;
  cardId: string;
  level: string;
  sceneJa: string;
  answer: string;
  review: ReviewResult | null;
  score: number | null;
  tags: string[];
  sourceAttemptId: string | null;
  savedAt: string;
};

type CloudSyncStatus = "local" | "loading" | "saving" | "saved" | "error";

type CardDeck = {
  id: string;
  title: string;
  description: string;
  cardIds: string[];
};

type PracticeTarget = {
  card: SceneCard;
  level: string;
};

type CloudPracticeResponse = {
  record?: PracticeState | null;
  error?: string;
};

type CloudAttemptResponse = {
  attempt?: PracticeAttempt;
  attempts?: PracticeAttempt[];
  error?: string;
};

type CloudNotesResponse = {
  note?: SavedNote;
  notes?: SavedNote[];
  error?: string;
};

const practiceStorageKey = "scene-builder.practice-state.v1";
const practiceAttemptsStorageKey = "scene-builder.practice-attempts.v1";
const savedNotesStorageKey = "scene-builder.saved-notes.v1";

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
  const [hasSelectedDeck, setHasSelectedDeck] = useState(false);
  const [isPracticeOpen, setIsPracticeOpen] = useState(false);
  const [hasAutoSelectedInitialPractice, setHasAutoSelectedInitialPractice] =
    useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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
  const [selectedCardId, setSelectedCardId] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("all");
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
  const [isSavingDraftCard, setIsSavingDraftCard] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showSavedNote, setShowSavedNote] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [lastPracticedAt, setLastPracticedAt] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [practiceStates, setPracticeStates] = useState<PracticeStates>({});
  const [practiceAttempts, setPracticeAttempts] = useState<PracticeAttempt[]>([]);
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>([]);
  const [noteStatus, setNoteStatus] = useState<CloudSyncStatus>(
    canUseCloudSync ? "loading" : "local",
  );
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const practiceStatesRef = useRef<PracticeStates>({});
  const [hasLoadedPracticeStates, setHasLoadedPracticeStates] = useState(false);
  const [loadedPracticeKey, setLoadedPracticeKey] = useState("");
  const [cloudReadyKey, setCloudReadyKey] = useState("");
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(
    canUseCloudSync ? "loading" : "local",
  );
  const [draftCard, setDraftCard] = useState<SceneCard | null>(null);

  const selectedCard = useMemo(
    () =>
      selectedCardId
        ? allCards.find((card) => card.id === selectedCardId) ?? null
        : null,
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

  const doneNote = getDoneNote(canUseCloudSync, cloudSyncStatus);

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const decks = useMemo(
    () => buildCardDecks(allCards, practiceStates, persistedCardIdSet),
    [allCards, persistedCardIdSet, practiceStates],
  );
  const selectedDeck = hasSelectedDeck
    ? decks.find((deck) => deck.id === selectedDeckId) ?? null
    : null;
  const visibleCardIdSet = useMemo(
    () => new Set(selectedDeck?.cardIds ?? []),
    [selectedDeck],
  );
  const visibleCards = useMemo(
    () => allCards.filter((card) => visibleCardIdSet.has(card.id)),
    [allCards, visibleCardIdSet],
  );
  const selectedCardNote = useMemo(
    () =>
      selectedCard
        ? savedNotes.find((note) => note.cardId === selectedCard.id) ?? null
        : null,
    [savedNotes, selectedCard],
  );
  const noteSyncLabel = getCloudSyncLabel(noteStatus);
  const nextPracticeTarget = useMemo(
    () =>
      findNextPracticeTarget(allCards, practiceStates, {
        excludeCardId: selectedCard?.id,
        excludeLevel: selectedLevelData?.level,
      }),
    [allCards, practiceStates, selectedCard, selectedLevelData],
  );

  useEffect(() => {
    if (!canAddCards) {
      setCustomCards([]);
    }
  }, [canAddCards]);

  useEffect(() => {
    if (!hasSelectedDeck) {
      return;
    }

    if (!decks.some((deck) => deck.id === selectedDeckId) && decks[0]) {
      setSelectedDeckId(decks[0].id);
      setSelectedCardId("");
      setIsPracticeOpen(false);
    }
  }, [decks, hasSelectedDeck, selectedDeckId]);

  useEffect(() => {
    if (
      hasSelectedDeck &&
      selectedCardId &&
      !visibleCards.some((card) => card.id === selectedCardId)
    ) {
      setSelectedCardId("");
      setIsPracticeOpen(false);
    }
  }, [hasSelectedDeck, selectedCardId, visibleCards]);

  useEffect(() => {
    if (
      hasAutoSelectedInitialPractice ||
      !hasLoadedPracticeStates ||
      allCards.length === 0
    ) {
      return;
    }

    const target = findNextPracticeTarget(allCards, practiceStates);

    if (target) {
      selectPracticeTarget(target);
    }

    setHasAutoSelectedInitialPractice(true);
  }, [
    allCards,
    hasAutoSelectedInitialPractice,
    hasLoadedPracticeStates,
    practiceStates,
  ]);

  useEffect(() => {
    if (!selectedCard) {
      return;
    }

    const preferredLevel = getPreferredPracticeLevel(selectedCard);
    const hasSelectedLevel = selectedCard.levels.some(
      (level) => level.level === selectedLevel,
    );

    if (!hasSelectedLevel && selectedLevel !== preferredLevel) {
      setSelectedLevel(preferredLevel);
    }
  }, [selectedCard, selectedLevel]);

  useEffect(() => {
    setPracticeStates(readPracticeStates());
    setPracticeAttempts(readPracticeAttempts());
    setSavedNotes(readSavedNotes());
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
      setReview(state?.review ?? null);
    };

    applyPracticeState(savedState);
    setShowModel(false);
    setShowHints(false);
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
      review,
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
    review,
    selectedPracticeKey,
  ]);

  useEffect(() => {
    if (!hasLoadedPracticeStates) {
      return;
    }

    writePracticeStates(practiceStates);
  }, [hasLoadedPracticeStates, practiceStates]);

  useEffect(() => {
    if (!hasLoadedPracticeStates) {
      return;
    }

    writePracticeAttempts(practiceAttempts);
  }, [hasLoadedPracticeStates, practiceAttempts]);

  useEffect(() => {
    if (!hasLoadedPracticeStates) {
      return;
    }

    writeSavedNotes(savedNotes);
  }, [hasLoadedPracticeStates, savedNotes]);

  useEffect(() => {
    if (!canUseCloudSync || !hasLoadedPracticeStates) {
      setNoteStatus("local");
      return;
    }

    let isCancelled = false;

    setNoteStatus("loading");
    fetch("/api/notes")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as CloudNotesResponse;

        if (!response.ok) {
          throw new Error(payload.error || "ノートの読み込みに失敗しました。");
        }

        if (!isCancelled && payload.notes) {
          setSavedNotes((current) => mergeSavedNotes(payload.notes ?? [], current));
          setNoteStatus("saved");
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setNoteStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [canUseCloudSync, hasLoadedPracticeStates]);

  useEffect(() => {
    if (!canUseCloudSync || !hasLoadedPracticeStates) {
      return;
    }

    let isCancelled = false;

    fetch("/api/practice/attempts")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as CloudAttemptResponse;

        if (!response.ok) {
          throw new Error(payload.error || "練習履歴の読み込みに失敗しました。");
        }

        if (!isCancelled && payload.attempts) {
          setPracticeAttempts((current) =>
            mergePracticeAttempts(payload.attempts ?? [], current),
          );
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCloudSyncStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [canUseCloudSync, hasLoadedPracticeStates]);

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
          review,
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
    review,
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

      const practicedAt = new Date().toISOString();
      setReview(payload.review);
      setIsDone(true);
      setLastPracticedAt(practicedAt);
      void recordPracticeAttempt({
        answer: trimmedAnswer,
        practicedAt,
        review: payload.review,
      });
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : "AI添削に失敗しました。",
      );
    } finally {
      setIsReviewing(false);
    }
  }

  async function handleCompleteOnly() {
    const trimmedAnswer = answer.trim();

    if (!trimmedAnswer) {
      setReviewError(
        "回答を入力してから保存してください。空の完了履歴は作成しません。",
      );
      return;
    }

    const practicedAt = new Date().toISOString();
    setReviewError(null);
    setIsDone(true);
    setLastPracticedAt(practicedAt);
    await recordPracticeAttempt({
      answer: trimmedAnswer,
      practicedAt,
      review,
    });
  }

  async function recordPracticeAttempt({
    answer: attemptAnswer,
    practicedAt,
    review: attemptReview,
  }: {
    answer: string;
    practicedAt: string;
    review: ReviewResult | null;
  }) {
    if (!selectedCard || !selectedLevelData) {
      return null;
    }

    const attempt: PracticeAttempt = {
      id: createClientId("attempt"),
      answer: attemptAnswer,
      cardId: selectedCard.id,
      level: selectedLevelData.level,
      practicedAt,
      review: attemptReview,
      score: attemptReview?.score ?? null,
    };

    setPracticeAttempts((current) => mergePracticeAttempts([attempt], current));
    setLastAttemptId(attempt.id);

    if (!canUseCloudSync) {
      return attempt;
    }

    try {
      const response = await fetch("/api/practice/attempts", {
        body: JSON.stringify(attempt),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as CloudAttemptResponse;

      if (!response.ok || !payload.attempt) {
        throw new Error(payload.error || "練習履歴のクラウド保存に失敗しました。");
      }

      setPracticeAttempts((current) =>
        mergePracticeAttempts([payload.attempt as PracticeAttempt], current),
      );
    } catch {
      setCloudSyncStatus("error");
    }

    return attempt;
  }

  async function handleSaveCurrentNote() {
    if (!selectedCard || !selectedLevelData) {
      return;
    }

    const trimmedAnswer = answer.trim();

    if (!trimmedAnswer) {
      setNoteError("ノートに保存する回答を入力してください。");
      return;
    }

    const savedAt = new Date().toISOString();
    const note: SavedNote = {
      id: selectedCardNote?.id ?? createSavedNoteId(selectedCard.id),
      answer: trimmedAnswer,
      cardId: selectedCard.id,
      level: normalizeSavedNoteLevel(selectedLevelData.level),
      review,
      savedAt,
      sceneJa: selectedCard.sceneJa,
      score: review?.score ?? null,
      sourceAttemptId: lastAttemptId,
      tags: selectedCard.tags.slice(0, 4),
    };

    setIsSavingNote(true);
    setNoteError(null);
    setShowSavedNote(true);
    setSavedNotes((current) => mergeSavedNotes([note], current));

    if (!canUseCloudSync) {
      setNoteStatus("local");
      setIsSavingNote(false);
      return;
    }

    setNoteStatus("saving");

    try {
      const response = await fetch("/api/notes", {
        body: JSON.stringify(note),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as CloudNotesResponse;

      if (!response.ok || !payload.note) {
        throw new Error(payload.error || "ノートのクラウド保存に失敗しました。");
      }

      setSavedNotes((current) => mergeSavedNotes([payload.note as SavedNote], current));
      setNoteStatus("saved");
    } catch (error) {
      setNoteStatus("error");
      setNoteError(
        error instanceof Error
          ? error.message
          : "ノートはlocalStorageに保存しました。クラウド保存は失敗しました。",
      );
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleGenerateCardDraft() {
    const trimmedScene = newCardSceneJa.trim();

    if (!trimmedScene) {
      setCardGenerationError("気づきやシチュエーションを入力してください。");
      return;
    }

    setIsGeneratingCard(true);
    setCardGenerationError(null);
    setDraftCard(null);

    try {
      const response = await fetch("/api/cards/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category: newCardCategory.trim() || "custom",
          persist: false,
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
      setDraftCard(generatedCard);
    } catch (error) {
      setCardGenerationError(
        error instanceof Error ? error.message : "カード案の生成に失敗しました。",
      );
    } finally {
      setIsGeneratingCard(false);
    }
  }

  async function handleSaveDraftCard() {
    if (!draftCard) {
      return;
    }

    setIsSavingDraftCard(true);
    setCardGenerationError(null);

    try {
      const response = await fetch("/api/cards", {
        body: JSON.stringify({ card: draftCard }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
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
        throw new Error(payload.error || "カード保存に失敗しました。");
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
      setSelectedLevel(getPreferredPracticeLevel(generatedCard));
      setSelectedDeckId("all");
      setHasSelectedDeck(false);
      setIsPracticeOpen(true);
      setNewCardSceneJa("");
      setNewCardTags("");
      setDraftCard(null);
      setIsCreateModalOpen(false);
    } catch (error) {
      setCardGenerationError(
        error instanceof Error ? error.message : "カード保存に失敗しました。",
      );
    } finally {
      setIsSavingDraftCard(false);
    }
  }

  function updateDraftCard(patch: Partial<SceneCard>) {
    setDraftCard((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleDeleteCustomCard(cardId: string) {
    const isPersistedCard = persistedCardIdSet.has(cardId);

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
      setSelectedCardId("");
      setIsPracticeOpen(false);
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

  function handleSelectDeck(deckId: string) {
    setSelectedDeckId(deckId);
    setHasSelectedDeck(true);
    setIsLibraryOpen(true);
    setSelectedCardId("");
    setSelectedLevel("");
    setIsPracticeOpen(false);
    setShowModel(false);
    setShowHints(false);
    setShowSavedNote(false);
    setReview(null);
    setReviewError(null);
  }

  function handleSelectCard(card: SceneCard) {
    const nextLevel = getPreferredPracticeLevel(card);
    setSelectedCardId(card.id);
    setSelectedLevel(nextLevel);
    setIsPracticeOpen(true);
    setHasSelectedDeck(false);
    setIsLibraryOpen(false);
    setShowModel(false);
    setShowHints(false);
    setShowSavedNote(false);
    setReview(null);
    setReviewError(null);
  }

  function handleReturnToDecks() {
    setIsLibraryOpen(true);
    setShowModel(false);
    setShowHints(false);
    setShowSavedNote(false);
    setReview(null);
    setReviewError(null);
  }

  function selectPracticeTarget(target: PracticeTarget) {
    setSelectedCardId(target.card.id);
    setSelectedLevel(target.level);
    setHasSelectedDeck(false);
    setIsPracticeOpen(true);
    setIsLibraryOpen(false);
    setShowModel(false);
    setShowHints(false);
    setShowSavedNote(false);
    setReview(null);
    setReviewError(null);
    setLastAttemptId(null);
  }

  function handleStartNextPractice() {
    if (!nextPracticeTarget) {
      setIsLibraryOpen(true);
      return;
    }

    selectPracticeTarget(nextPracticeTarget);
  }

  return (
    <div className="practice-shell">
      <section className="mode-hero" aria-label="モード選択">
        <div className="mode-copy">
          <span>Scene Builder</span>
          <h1>今日の1シーン</h1>
        </div>
        <div className="mode-actions">
          <button
            className="secondary-button compact-button"
            onClick={() => setIsLibraryOpen((current) => !current)}
          >
            <BookOpen aria-hidden="true" size={18} />
            Library
          </button>
          <button
            className="primary-button compact-button"
            disabled={!canAddCards}
            onClick={() => setIsCreateModalOpen(true)}
          >
            <PencilLine aria-hidden="true" size={18} />
            作成
          </button>
        </div>
      </section>

      <aside
        className="scene-list"
        aria-label="シーン一覧"
        hidden={!isLibraryOpen}
      >
        <div className="sidebar-heading">
          <span>Decks</span>
          <span>{decks.length}</span>
        </div>
        <div className="deck-list" aria-label="デッキ">
          {decks.map((deck) => (
            <button
              aria-pressed={deck.id === selectedDeck?.id}
              className={deck.id === selectedDeck?.id ? "deck-item active" : "deck-item"}
              key={deck.id}
              onClick={() => handleSelectDeck(deck.id)}
            >
              <span>
                <strong>{deck.title}</strong>
                <small>{deck.description}</small>
              </span>
              <b>{deck.cardIds.length}</b>
            </button>
          ))}
        </div>
        {hasSelectedDeck ? (
          <>
            <div className="sidebar-heading card-list-heading">
              <span>Cards</span>
              <span>{visibleCards.length}/{allCards.length}</span>
            </div>
            {visibleCards.map((card) => {
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
                    onClick={() => handleSelectCard(card)}
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
          </>
        ) : (
          <div className="deck-empty-state">まずデッキを選ぶとカードが表示されます。</div>
        )}
      </aside>

      <main
        className={
          [
            "practice-main",
            selectedCard && isPracticeOpen ? "" : "practice-main-single",
            isLibraryOpen ? "" : "practice-main-full",
          ]
            .filter(Boolean)
            .join(" ")
        }
      >
        {hasSelectedDeck ? (
          <section className="card-picker-panel" aria-label="カード選択">
            <div className="card-picker-heading">
              <span className="prompt-kicker">{selectedDeck?.title ?? "DECK"}</span>
              <div className="picker-heading-row">
                <h2>カードを1枚選ぶ</h2>
                <button className="secondary-button compact-button" onClick={handleReturnToDecks}>
                  閉じる
                </button>
              </div>
              <p>{visibleCards.length} cards</p>
            </div>
            {visibleCards.length > 0 ? (
              <div className="study-card-list">
                {visibleCards.map((card) => {
                  const isCustomCard =
                    persistedCardIdSet.has(card.id) ||
                    customCards.some((customCard) => customCard.id === card.id);

                  return (
                    <div className="study-card-entry" key={card.id}>
                      <button
                        className="study-card-choice"
                        onClick={() => handleSelectCard(card)}
                      >
                        <span>{card.sceneJa}</span>
                        <small>
                          {isCustomCard ? `${card.category} / custom` : card.category}
                        </small>
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
              </div>
            ) : (
              <div className="done-note">このデッキにはカードがありません。</div>
            )}
          </section>
        ) : !selectedCard ? (
          <section className="deck-start-panel today-start-panel" aria-label="今日の練習">
            <div className="deck-start-heading">
              <span className="prompt-kicker">TODAY</span>
              <h2>未完了の1シーンを準備しています</h2>
              <p>
                未完了の練習が見つからない場合は、Libraryから好きなシーンを選べます。
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => {
                const target = findNextPracticeTarget(allCards, practiceStates);

                if (target) {
                  selectPracticeTarget(target);
                } else {
                  setIsLibraryOpen(true);
                }
              }}
            >
              今日の練習を始める
            </button>
            <div className="deck-card-grid">
              {decks.map((deck) => (
                <button
                  className="deck-card"
                  key={deck.id}
                  onClick={() => handleSelectDeck(deck.id)}
                >
                  <span>
                    <strong>{deck.title}</strong>
                    <small>{deck.description}</small>
                  </span>
                  <b>{deck.cardIds.length}</b>
                </button>
              ))}
            </div>
            {savedNotes.length > 0 ? (
              <div className="saved-notes-panel inline-notes">
                <div className="review-heading">
                  <h3>最近の保存ノート</h3>
                  <span className={`status-pill sync ${noteStatus}`}>
                    {noteSyncLabel}
                  </span>
                </div>
                <div className="note-list">
                  {savedNotes.slice(0, 5).map((note) => (
                    <article className="note-entry" key={note.id}>
                      <div className="note-entry-heading">
                        <strong>{note.sceneJa || note.cardId}</strong>
                        {note.score !== null ? <span>{note.score}/10</span> : null}
                      </div>
                      <p>{note.answer}</p>
                      <small>{note.level} / {formatSavedAt(note.savedAt)}</small>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="work-panel one-scene-card" id="scene-overview">
              {isPracticeOpen ? (
                <>
                  <div className="practice-guide">
                    <strong>シチュエーションで英語を言いたいときに作成</strong>
                    <span>隙間時間に作文TRY。回答したらAI添削で自然な言い方を確認できます。</span>
                  </div>
                  <div className="practice-layout">
                    <div className="practice-input-column">
                    <div className="level-tabs" aria-label="難易度" id="practice-levels">
                      {selectedCard.levels.map((level) => (
                        <button
                          className={level.level === selectedLevel ? "active" : ""}
                          key={level.level}
                          onClick={() => {
                            setLastAttemptId(null);
                            setSelectedLevel(level.level);
                            setShowModel(false);
                            setShowHints(false);
                            setReview(null);
                            setReviewError(null);
                          }}
                        >
                          {formatPracticeLevelLabel(level.name, level.level)}
                        </button>
                      ))}
                    </div>

                    <div className="level-detail">
                      <p>短くてもOK。今言える英語でまず1文書いてみる。</p>
                      {isDone || needsReview ? (
                        <div className="practice-meta">
                          {isDone ? <span className="status-pill done">完了</span> : null}
                          {needsReview ? <span className="status-pill review">要復習</span> : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="practice-prompt-panel">
                      <span>お題</span>
                      <p>{selectedCard.promptJa || selectedCard.sceneJa}</p>
                    </div>

                    <div id="answer-practice">
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
                    </div>

                    <div className="action-row" id="practice-actions">
                      <span>{wordCount} words</span>
                      <div>
                        <label
                          aria-label="要復習"
                          className={needsReview ? "review-toggle active" : "review-toggle"}
                          title="要復習"
                        >
                          <input
                            checked={needsReview}
                            onChange={(event) => {
                              setNeedsReview(event.target.checked);
                              setLastPracticedAt(new Date().toISOString());
                            }}
                            type="checkbox"
                          />
                          <Flag aria-hidden="true" size={15} />
                        </label>
                        <button
                          aria-label="リセット"
                          className="icon-button"
                          onClick={() => {
                            setAnswer("");
                            setShowModel(false);
                            setShowHints(false);
                            setIsDone(false);
                            setNeedsReview(false);
                            setLastPracticedAt(null);
                            setReview(null);
                            setReviewError(null);
                          }}
                          title="リセット"
                        >
                          <RotateCcw aria-hidden="true" size={16} />
                        </button>
                        <button
                          aria-label="模範回答"
                          className="icon-button"
                          onClick={() => setShowModel((current) => !current)}
                          title="模範回答"
                        >
                          <Eye aria-hidden="true" size={16} />
                        </button>
                        <button
                          className="primary-button"
                          disabled={isReviewing}
                          onClick={handleAiReview}
                        >
                          <Sparkles aria-hidden="true" size={16} />
                          {isReviewing ? "添削中" : "AI添削"}
                        </button>
                        <button
                          aria-label="完了だけ保存"
                          className="secondary-button"
                          onClick={handleCompleteOnly}
                          title="完了だけ保存"
                        >
                          <Check aria-hidden="true" size={16} />
                          完了
                        </button>
                        <button
                          aria-label={isSavingNote ? "保存中" : "ノートに保存"}
                          className="icon-button"
                          disabled={isSavingNote}
                          onClick={handleSaveCurrentNote}
                          title={isSavingNote ? "保存中" : "ノートに保存"}
                        >
                          <Save aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </div>

                    {noteError ? <div className="error-note">{noteError}</div> : null}
                  </div>

                  <div className="practice-support-column">
                    <div className="deck-mini-panel">
                      <div className="review-heading">
                        <h3>Deck</h3>
                        <span>{decks.length}</span>
                      </div>
                      <div className="deck-mini-list">
                        {decks.slice(0, 5).map((deck) => (
                          <button
                            className={
                              deck.id === selectedDeckId ? "deck-mini-item active" : "deck-mini-item"
                            }
                            key={deck.id}
                            onClick={() => handleSelectDeck(deck.id)}
                          >
                            <span>{deck.title}</span>
                            <b>{deck.cardIds.length}</b>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="saved-answer-panel">
                      <div className="review-heading">
                        <h3>自分の回答パターン</h3>
                        {selectedCardNote ? (
                          <span className={`status-pill sync ${noteStatus}`}>
                            {noteSyncLabel}
                          </span>
                        ) : null}
                      </div>
                      {selectedCardNote ? (
                        <>
                          <button
                            className="secondary-button note-reveal-button"
                            onClick={() => setShowSavedNote((current) => !current)}
                          >
                            <NotebookTabs aria-hidden="true" size={16} />
                            {showSavedNote ? "閉じる" : "ノートを見る"}
                          </button>
                          {showSavedNote ? (
                            <div className="saved-answer-body">
                              <p>{selectedCardNote.answer}</p>
                              {selectedCardNote.review?.naturalAnswer ? (
                                <small>{selectedCardNote.review.naturalAnswer}</small>
                              ) : null}
                            </div>
                          ) : (
                            <div className="saved-answer-blind">
                              保存済み。必要なときだけ開けます。
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="saved-answer-blind">
                          保存アイコンで、このカード用に1つだけ残せます。
                        </div>
                      )}
                    </div>

                    <div className="hint-panel" id="practice-hints">
                      <button
                        aria-expanded={showHints}
                        aria-label="ヒント"
                        className="hint-toggle"
                        onClick={() => setShowHints((current) => !current)}
                        title="ヒント"
                      >
                        <Lightbulb aria-hidden="true" size={16} />
                      </button>
                      {showHints ? (
                        <div className="hint-body">
                          <div>
                            <strong>使える材料</strong>
                            <p>理由、気持ち、相手への質問を1つ足すと会話らしくなります。</p>
                          </div>
                          <div>
                            <strong>補助</strong>
                            <p>{selectedCard.promptEn}</p>
                            <p>{selectedCard.promptJa}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>

                {showModel ? (
                  <div className="model-answer">
                    <h3>Model answer</h3>
                    <p className="model-en">{selectedLevelData?.answerEn}</p>
                    <p>{selectedLevelData?.answerJa}</p>
                  </div>
                ) : null}

                {reviewError ? <div className="error-note">{reviewError}</div> : null}

                {review ? (
                  <div className="ai-review">
                    <div className="review-heading">
                      <h3>難易度への成立度</h3>
                      <span>{review.score}/10</span>
                    </div>
                    <dl>
                      {review.naturalAnswer ? (
                        <div>
                          <dt>自然な言い換え</dt>
                          <dd>{review.naturalAnswer}</dd>
                        </div>
                      ) : null}
                      {review.fix ? (
                        <div>
                          <dt>修正するなら</dt>
                          <dd>{review.fix}</dd>
                        </div>
                      ) : null}
                      {review.phraseToRemember ? (
                        <div>
                          <dt>次に足す表現</dt>
                          <dd>{review.phraseToRemember}</dd>
                        </div>
                      ) : null}
                      {review.nextPractice ? (
                        <div>
                          <dt>次の一手</dt>
                          <dd>{review.nextPractice}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}

                {isDone ? (
                  <div className="done-note completion-note">
                    <strong>今日1シーン完了</strong>
                    <span>{doneNote}</span>
                    <button className="primary-button" onClick={handleStartNextPractice}>
                      もう一つやる
                    </button>
                  </div>
                ) : null}
                  </div>
                  </div>
                </>
              ) : null}
            </section>
          </>
        )}
      </main>

      {canAddCards && !isPracticeOpen ? (
        <button
          aria-label="作成モードを開く"
          className="floating-create-button"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <PencilLine aria-hidden="true" size={22} />
        </button>
      ) : null}

      {!isPracticeOpen ? (
        <button
          aria-label="Libraryを開く"
          className="floating-library-button"
          onClick={() => setIsLibraryOpen((current) => !current)}
        >
          <BookOpen aria-hidden="true" size={22} />
        </button>
      ) : null}

      {isCreateModalOpen ? (
        <div
          aria-label="作成モード"
          aria-modal="true"
          className="creation-modal-backdrop"
          role="dialog"
        >
          <main className="creation-main creation-modal">
            <button
              aria-label="作成モードを閉じる"
              className="icon-button modal-close-button"
              onClick={() => setIsCreateModalOpen(false)}
            >
              <X aria-hidden="true" size={18} />
            </button>
          <section className="creation-panel">
            <div className="creation-heading">
              <span className="prompt-kicker">作成モード</span>
              <h1>気づきを練習シチュエーションに変える</h1>
              <p>
                「この場面で何て言うんだろ」をラフに入力すると、AIが学習用カード案を作ります。
              </p>
            </div>
            {canAddCards ? (
              <div className="creation-layout">
                <div className="card-builder create-form">
                  <label>
                    <span>気づき / 疑問</span>
                    <textarea
                      onChange={(event) => {
                        setNewCardSceneJa(event.target.value);
                        setCardGenerationError(null);
                      }}
                      placeholder="例: スケボーで、今日オーリーが全然安定しなかったって言いたい"
                      rows={5}
                      value={newCardSceneJa}
                    />
                  </label>
                  <label>
                    <span>テーマ</span>
                    <input
                      onChange={(event) => setNewCardCategory(event.target.value)}
                      value={newCardCategory}
                    />
                  </label>
                  <label>
                    <span>タグ</span>
                    <input
                      onChange={(event) => setNewCardTags(event.target.value)}
                      placeholder="skate;practice;feeling"
                      value={newCardTags}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={isGeneratingCard}
                    onClick={handleGenerateCardDraft}
                  >
                    <Sparkles aria-hidden="true" size={16} />
                    {isGeneratingCard ? "生成中" : "AIでカード案を作る"}
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

                <div className="draft-preview">
                  {draftCard ? (
                    <>
                      <div className="draft-heading">
                        <h2>カード案</h2>
                        <p>保存前にシチュエーションと補助情報を微修正できます。</p>
                      </div>
                      <label>
                        <span>テーマ</span>
                        <input
                          onChange={(event) =>
                            updateDraftCard({ category: event.target.value })
                          }
                          value={draftCard.category}
                        />
                      </label>
                      <label>
                        <span>シチュエーション</span>
                        <textarea
                          onChange={(event) =>
                            updateDraftCard({ sceneJa: event.target.value })
                          }
                          rows={3}
                          value={draftCard.sceneJa}
                        />
                      </label>
                      <label>
                        <span>英語補助</span>
                        <textarea
                          onChange={(event) =>
                            updateDraftCard({ promptEn: event.target.value })
                          }
                          rows={2}
                          value={draftCard.promptEn}
                        />
                      </label>
                      <label>
                        <span>日本語補助</span>
                        <textarea
                          onChange={(event) =>
                            updateDraftCard({ promptJa: event.target.value })
                          }
                          rows={2}
                          value={draftCard.promptJa}
                        />
                      </label>
                      <label>
                        <span>タグ</span>
                        <input
                          onChange={(event) =>
                            updateDraftCard({ tags: parseTags(event.target.value) })
                          }
                          value={draftCard.tags.join(";")}
                        />
                      </label>
                      <div className="draft-levels">
                        {draftCard.levels.map((level) => (
                          <div className="draft-level" key={level.level}>
                            <strong>{level.level}</strong>
                            <span>{level.name}</span>
                            <small>{level.reviewPoints}</small>
                          </div>
                        ))}
                      </div>
                      <button
                        className="primary-button"
                        disabled={isSavingDraftCard}
                        onClick={handleSaveDraftCard}
                      >
                        <Save aria-hidden="true" size={16} />
                        {isSavingDraftCard ? "保存中" : "保存して学習に追加"}
                      </button>
                    </>
                  ) : (
                    <div className="empty-draft">
                      <PencilLine aria-hidden="true" size={28} />
                      <h2>AIカード案がここに表示されます</h2>
                      <p>まず左側に、英語で言えなかった場面や気づきを入力してください。</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="done-note">
                作成モードはowner権限で利用できます。学習モードで練習を続けてください。
              </div>
            )}
          </section>
          </main>
        </div>
      ) : null}
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
  const { doneCount, hasReview } = getCardPracticeSummary(card, states);

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

function buildCardDecks(
  cards: SceneCard[],
  states: PracticeStates,
  persistedCardIdSet: Set<string>,
): CardDeck[] {
  const decks: CardDeck[] = [
    {
      id: "all",
      title: "All cards",
      description: "すべての場面",
      cardIds: cards.map((card) => card.id),
    },
  ];
  const reviewCardIds = cards
    .filter((card) => getCardPracticeSummary(card, states).hasReview)
    .map((card) => card.id);
  const activeCardIds = cards
    .filter((card) => {
      const summary = getCardPracticeSummary(card, states);
      return summary.hasStarted && summary.doneCount < card.levels.length;
    })
    .map((card) => card.id);
  const ownerCardIds = cards
    .filter((card) => persistedCardIdSet.has(card.id) || card.category === "custom")
    .map((card) => card.id);

  if (reviewCardIds.length > 0) {
    decks.push({
      id: "review",
      title: "Review",
      description: "要復習",
      cardIds: reviewCardIds,
    });
  }

  if (activeCardIds.length > 0) {
    decks.push({
      id: "active",
      title: "In progress",
      description: "途中のカード",
      cardIds: activeCardIds,
    });
  }

  if (ownerCardIds.length > 0) {
    decks.push({
      id: "owner",
      title: "Owner deck",
      description: "追加カード",
      cardIds: ownerCardIds,
    });
  }

  const categoryMap = new Map<string, string[]>();

  for (const card of cards) {
    const category = card.category || "uncategorized";
    const categoryCardIds = categoryMap.get(category) ?? [];
    categoryCardIds.push(card.id);
    categoryMap.set(category, categoryCardIds);
  }

  for (const [category, cardIds] of [...categoryMap.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    decks.push({
      id: `category:${category}`,
      title: formatDeckTitle(category),
      description: "カテゴリ",
      cardIds,
    });
  }

  return decks;
}

function getCardPracticeSummary(card: SceneCard, states: PracticeStates) {
  const cardStates = card.levels
    .map((level) => states[getPracticeKey(card.id, level.level)])
    .filter((state): state is PracticeState => Boolean(state));
  const doneCount = cardStates.filter((state) => state.isDone).length;
  const hasReview = cardStates.some((state) => state.needsReview);
  const hasStarted = cardStates.some(hasMeaningfulPracticeState);

  return {
    doneCount,
    hasReview,
    hasStarted,
  };
}

function findNextPracticeTarget(
  cards: SceneCard[],
  states: PracticeStates,
  options: {
    excludeCardId?: string;
    excludeLevel?: string;
  } = {},
): PracticeTarget | null {
  const incompleteTargets: PracticeTarget[] = [];

  for (const card of cards) {
    const preferredLevels = getPracticeLevelsInOrder(card);

    for (const level of preferredLevels) {
      if (
        options.excludeCardId === card.id &&
        options.excludeLevel === level.level
      ) {
        continue;
      }

      const state = states[getPracticeKey(card.id, level.level)];

      if (!state?.isDone) {
        incompleteTargets.push({ card, level: level.level });
      }
    }
  }

  return incompleteTargets[0] ?? null;
}

function getPreferredPracticeLevel(card: SceneCard): string {
  return getPracticeLevelsInOrder(card)[0]?.level ?? card.levels[0]?.level ?? "L1";
}

function getPracticeLevelsInOrder(card: SceneCard): SceneCard["levels"] {
  const naturalLevels = card.levels.filter(isNaturalPracticeLevel);
  const otherLevels = card.levels.filter((level) => !isNaturalPracticeLevel(level));

  return [...naturalLevels, ...otherLevels];
}

function isNaturalPracticeLevel(level: SceneCard["levels"][number]): boolean {
  const normalized = `${level.name} ${level.level}`.toLowerCase();

  return normalized.includes("natural") || level.name.includes("自然");
}

function formatPracticeLevelLabel(name: string, level: string): string {
  const normalized = `${name} ${level}`.toLowerCase();

  if (normalized.includes("natural") || name.includes("自然")) {
    return "自然な会話";
  }

  if (normalized.includes("eiken") || name.includes("英検")) {
    return "とりあえず伝わる";
  }

  if (level === "L1") {
    return "単語";
  }

  if (level === "L2") {
    return "一文";
  }

  if (level === "L3") {
    return "場面";
  }

  if (level === "L4") {
    return "会話";
  }

  return name || level;
}

function formatDeckTitle(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

/**
 * Render a diagnostics summary listing service readiness and configuration values.
 *
 * @param diagnostics - Runtime diagnostics snapshot used to populate readiness rows and configuration fields
 * @returns A JSX element containing a definition list of readiness indicators and related configuration values.
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
        <DiagnosticsRow isReady={diagnostics.database.configured} label="Database" />
        <DiagnosticsRow isReady={diagnostics.ai.apiKeyConfigured} label="AI key" />
        <DiagnosticsRow
          isReady={
            diagnostics.cards.persistenceConfigured && diagnostics.cards.schemaReady
          }
          label="scene_cards"
          notReadyLabel={diagnostics.cards.persistenceConfigured ? "未準備" : "未設定"}
        />
        <DiagnosticsRow
          isReady={
            diagnostics.practiceStorage.persistenceConfigured &&
            diagnostics.practiceStorage.practiceAttemptsReady
          }
          label="practice_attempts"
          notReadyLabel={
            diagnostics.practiceStorage.persistenceConfigured ? "未準備" : "未設定"
          }
        />
        <DiagnosticsRow
          isReady={
            diagnostics.practiceStorage.persistenceConfigured &&
            diagnostics.practiceStorage.savedNotesReady
          }
          label="saved_notes"
          notReadyLabel={
            diagnostics.practiceStorage.persistenceConfigured ? "未準備" : "未設定"
          }
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
          <dt>GitHub owner</dt>
          <dd>@{diagnostics.auth.ownerGithubUsername}</dd>
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
 * Renders a labeled status row that displays readiness as "OK" or a sanitized fallback label.
 *
 * @param isReady - Whether the item is ready; controls text and CSS class.
 * @param label - The label text shown for the row.
 * @param notReadyLabel - The text shown when the row is not ready.
 * @returns A definition-row element (`<dt>`/`<dd>`) with a readiness pill styled via `"ok"` or `"warn"`.
 */
function DiagnosticsRow({
  isReady,
  label,
  notReadyLabel = "未設定",
}: {
  isReady: boolean;
  label: string;
  notReadyLabel?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={isReady ? "ok" : "warn"}>
        {isReady ? "OK" : notReadyLabel}
      </dd>
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

function readPracticeAttempts(): PracticeAttempt[] {
  try {
    const rawValue = window.localStorage.getItem(practiceAttemptsStorageKey);

    if (!rawValue) {
      return [];
    }

    return normalizePracticeAttempts(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

function writePracticeAttempts(attempts: PracticeAttempt[]) {
  try {
    if (attempts.length === 0) {
      window.localStorage.removeItem(practiceAttemptsStorageKey);
      return;
    }

    window.localStorage.setItem(
      practiceAttemptsStorageKey,
      JSON.stringify(attempts.slice(0, 80)),
    );
  } catch {
    // localStorage may be unavailable in restricted browser contexts.
  }
}

function readSavedNotes(): SavedNote[] {
  try {
    const rawValue = window.localStorage.getItem(savedNotesStorageKey);

    if (!rawValue) {
      return [];
    }

    return normalizeSavedNotes(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

function writeSavedNotes(notes: SavedNote[]) {
  try {
    if (notes.length === 0) {
      window.localStorage.removeItem(savedNotesStorageKey);
      return;
    }

    window.localStorage.setItem(savedNotesStorageKey, JSON.stringify(notes.slice(0, 80)));
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
    review: normalizeReviewResult(value.review),
  };
}

function normalizePracticeAttempts(value: unknown): PracticeAttempt[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizePracticeAttempt)
    .filter((attempt): attempt is PracticeAttempt => Boolean(attempt))
    .sort((a, b) => b.practicedAt.localeCompare(a.practicedAt));
}

function normalizePracticeAttempt(value: unknown): PracticeAttempt | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getString(value.id);
  const cardId = getString(value.cardId);
  const level = getString(value.level);
  const practicedAt = getString(value.practicedAt);

  if (!id || !cardId || !level || !isValidDateString(practicedAt)) {
    return null;
  }

  const review = normalizeReviewResult(value.review);

  return {
    id,
    answer: getString(value.answer),
    cardId,
    level,
    practicedAt,
    review,
    score: typeof value.score === "number" ? value.score : review?.score ?? null,
  };
}

function normalizeSavedNotes(value: unknown): SavedNote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeSavedNote)
    .filter((note): note is SavedNote => Boolean(note))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function normalizeSavedNote(value: unknown): SavedNote | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getString(value.id);
  const cardId = getString(value.cardId);
  const level = getString(value.level);
  const savedAt = getString(value.savedAt);

  if (!id || !cardId || !level || !isValidDateString(savedAt)) {
    return null;
  }

  const review = normalizeReviewResult(value.review);

  return {
    id,
    answer: getString(value.answer),
    cardId,
    level,
    review,
    savedAt,
    sceneJa: getString(value.sceneJa),
    score: typeof value.score === "number" ? value.score : review?.score ?? null,
    sourceAttemptId: getString(value.sourceAttemptId) || null,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
      : [],
  };
}

function hasMeaningfulPracticeState(state: PracticeState): boolean {
  return Boolean(
    state.answer.trim() ||
      state.isDone ||
      state.needsReview ||
      state.lastPracticedAt ||
      state.review,
  );
}

function normalizeReviewResult(value: unknown): ReviewResult | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    score: clampReviewScore(value.score),
    goodPoint: getString(value.goodPoint),
    fix: getString(value.fix),
    naturalAnswer: getString(value.naturalAnswer),
    phraseToRemember: getString(value.phraseToRemember),
    nextPractice: getString(value.nextPractice),
    sceneFit: getString(value.sceneFit),
  };
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clampReviewScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(10, Math.round(score)));
}

function arePracticeStatesEqual(
  current: PracticeStates,
  next: PracticeStates,
): boolean {
  return JSON.stringify(current) === JSON.stringify(next);
}

function mergePracticeAttempts(
  incoming: PracticeAttempt[],
  current: PracticeAttempt[],
): PracticeAttempt[] {
  const attempts = new Map<string, PracticeAttempt>();

  for (const attempt of [...incoming, ...current]) {
    attempts.set(attempt.id, attempt);
  }

  return [...attempts.values()]
    .sort((a, b) => b.practicedAt.localeCompare(a.practicedAt))
    .slice(0, 80);
}

function mergeSavedNotes(incoming: SavedNote[], current: SavedNote[]): SavedNote[] {
  const notes = new Map<string, SavedNote>();

  for (const note of [...incoming, ...current].sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  )) {
    if (!notes.has(note.cardId)) {
      notes.set(note.cardId, note);
    }
  }

  return [...notes.values()]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 80);
}

function createSavedNoteId(cardId: string): string {
  return `note-${cardId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100)}`;
}

function normalizeSavedNoteLevel(level: string): string {
  return ["L1", "L2", "L3", "L4"].includes(level) ? level : "L1";
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

function formatSavedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function isValidDateString(value: string): boolean {
  return Boolean(value) && !Number.isNaN(new Date(value).getTime());
}

function parseTags(value: string): string[] {
  return value.split(";").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
