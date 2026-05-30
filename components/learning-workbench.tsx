"use client";

import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  PenLine,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  LearningData,
  LevelCode,
  PracticeItem,
  PracticeLevel,
} from "@/lib/data";

type Mode = "topic" | "diary";
type Status = "new" | "learned" | "review";
type CheckKey = "meaning" | "subjectVerb" | "tense" | "stolenPhrase" | "speakable";

type ReviewResult = {
  score: number;
  goodPoint: string;
  fix: string;
  naturalAnswer: string;
  phraseToRemember: string;
  nextPractice: string;
};

type StoredPractice = {
  answer: string;
  checks: Record<CheckKey, boolean>;
  status: Status;
  review?: ReviewResult;
};

type LearningWorkbenchProps = {
  data: LearningData;
  canUseCloudSync: boolean;
  canUseReview: boolean;
};

type PracticeApiRecord = StoredPractice & {
  createdAt: string;
  itemId: string;
  level: LevelCode;
  mode: Mode;
  ownerLogin: string;
  updatedAt: string;
};

type PracticeApiResponse = {
  record: PracticeApiRecord | null;
};

type SyncState = "local" | "loading" | "saving" | "synced" | "error";

const storagePrefix = "scene-builder:v1";

const emptyChecks: Record<CheckKey, boolean> = {
  meaning: false,
  subjectVerb: false,
  tense: false,
  stolenPhrase: false,
  speakable: false,
};

const checkItems: Array<{ key: CheckKey; label: string }> = [
  { key: "meaning", label: "言いたい内容が入っている" },
  { key: "subjectVerb", label: "主語と動詞がある" },
  { key: "tense", label: "時制が合っている" },
  { key: "stolenPhrase", label: "表現を1つ盗めた" },
  { key: "speakable", label: "次に声に出せそう" },
];

function makeStorageKey(mode: Mode, itemId: string, level: LevelCode) {
  return `${storagePrefix}:${mode}:${itemId}:${level}`;
}

function createInitialPractice(): StoredPractice {
  return {
    answer: "",
    checks: { ...emptyChecks },
    status: "new",
  };
}

function normalizePractice(value: Partial<StoredPractice> | undefined): StoredPractice {
  return {
    answer: typeof value?.answer === "string" ? value.answer : "",
    checks: {
      meaning: value?.checks?.meaning === true,
      subjectVerb: value?.checks?.subjectVerb === true,
      tense: value?.checks?.tense === true,
      stolenPhrase: value?.checks?.stolenPhrase === true,
      speakable: value?.checks?.speakable === true,
    },
    status:
      value?.status === "learned" || value?.status === "review" ? value.status : "new",
    review: value?.review,
  };
}

function readStoredPractice(raw: string | null) {
  if (!raw) {
    return createInitialPractice();
  }

  try {
    return normalizePractice(JSON.parse(raw) as Partial<StoredPractice>);
  } catch {
    return createInitialPractice();
  }
}

function hasPracticeContent(practice: StoredPractice) {
  return Boolean(
    practice.answer.trim() ||
      Object.values(practice.checks).some(Boolean) ||
      practice.status !== "new" ||
      practice.review,
  );
}

function makePracticeApiUrl(mode: Mode, itemId: string, level: LevelCode) {
  const params = new URLSearchParams({
    mode,
    itemId,
    level,
  });

  return `/api/practice?${params.toString()}`;
}

function getItems(data: LearningData, mode: Mode) {
  return mode === "topic" ? data.topicCards : data.diaryPrompts;
}

function getCategories(data: LearningData, mode: Mode) {
  return mode === "topic" ? data.categories : data.diaryCategories;
}

function findLevel(item: PracticeItem, level: LevelCode) {
  return item.levels.find((candidate) => candidate.level === level) ?? item.levels[0];
}

function statusLabel(status: Status) {
  if (status === "learned") {
    return "学習済み";
  }

  if (status === "review") {
    return "要復習";
  }

  return "未整理";
}

function syncLabel(syncState: SyncState) {
  if (syncState === "loading") {
    return "Loading cloud";
  }

  if (syncState === "saving") {
    return "Saving cloud";
  }

  if (syncState === "synced") {
    return "Cloud saved";
  }

  if (syncState === "error") {
    return "Local only";
  }

  return "Local";
}

export function LearningWorkbench({
  data,
  canUseCloudSync,
  canUseReview,
}: LearningWorkbenchProps) {
  const [mode, setMode] = useState<Mode>("topic");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState(
    data.topicCards[0]?.id ?? data.diaryPrompts[0]?.id ?? "",
  );
  const [selectedLevel, setSelectedLevel] = useState<LevelCode>("L1");
  const [practice, setPractice] = useState<StoredPractice>(createInitialPractice);
  const [cloudReadyKey, setCloudReadyKey] = useState<string | null>(null);
  const [cloudRecordKey, setCloudRecordKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<"idle" | "loading" | "error">("idle");
  const [syncState, setSyncState] = useState<SyncState>(
    canUseCloudSync ? "loading" : "local",
  );

  const items = useMemo(() => getItems(data, mode), [data, mode]);
  const categories = useMemo(() => getCategories(data, mode), [data, mode]);

  const filteredItems = useMemo(() => {
    if (category === "all") {
      return items;
    }

    return items.filter((item) => item.category === category);
  }, [category, items]);

  const selectedItem = useMemo(() => {
    return filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];
  }, [filteredItems, selectedId]);

  const currentLevel = selectedItem ? findLevel(selectedItem, selectedLevel) : undefined;
  const currentStorageKey =
    selectedItem && currentLevel ? makeStorageKey(mode, selectedItem.id, currentLevel.level) : null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!currentStorageKey) {
      return;
    }

    const localPractice = readStoredPractice(window.localStorage.getItem(currentStorageKey));

    setPractice(localPractice);
    setCloudReadyKey(canUseCloudSync ? null : currentStorageKey);
    setCloudRecordKey(null);
    setReviewState("idle");
    setLoadedKey(currentStorageKey);

    if (!canUseCloudSync || !selectedItem || !currentLevel) {
      setSyncState("local");
      return;
    }

    const itemId = selectedItem.id;
    const level = currentLevel.level;
    let isCancelled = false;

    async function loadCloudPractice() {
      setSyncState("loading");

      try {
        const response = await fetch(makePracticeApiUrl(mode, itemId, level));

        if (!response.ok) {
          throw new Error("Failed to load practice record");
        }

        const result = (await response.json()) as PracticeApiResponse;

        if (isCancelled) {
          return;
        }

        if (result.record) {
          setPractice(normalizePractice(result.record));
          setCloudRecordKey(currentStorageKey);
          setSyncState("synced");
        } else {
          setSyncState("local");
        }

        setCloudReadyKey(currentStorageKey);
      } catch {
        if (!isCancelled) {
          setCloudReadyKey(currentStorageKey);
          setSyncState("error");
        }
      }
    }

    loadCloudPractice();

    return () => {
      isCancelled = true;
    };
  }, [canUseCloudSync, currentLevel, currentStorageKey, mode, selectedItem]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!currentStorageKey || loadedKey !== currentStorageKey) {
      return;
    }

    window.localStorage.setItem(currentStorageKey, JSON.stringify(practice));
  }, [currentStorageKey, loadedKey, practice]);

  useEffect(() => {
    if (
      !canUseCloudSync ||
      !currentStorageKey ||
      !selectedItem ||
      !currentLevel ||
      loadedKey !== currentStorageKey ||
      cloudReadyKey !== currentStorageKey
    ) {
      return;
    }

    const shouldSave = hasPracticeContent(practice) || cloudRecordKey === currentStorageKey;

    if (!shouldSave) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSyncState("saving");

      try {
        const response = await fetch("/api/practice", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode,
            itemId: selectedItem.id,
            level: currentLevel.level,
            answer: practice.answer,
            checks: practice.checks,
            status: practice.status,
            review: practice.review,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to save practice record");
        }

        setCloudRecordKey(currentStorageKey);
        setSyncState("synced");
      } catch {
        if (!controller.signal.aborted) {
          setSyncState("error");
        }
      }
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    canUseCloudSync,
    cloudReadyKey,
    cloudRecordKey,
    currentLevel,
    currentStorageKey,
    loadedKey,
    mode,
    practice,
    selectedItem,
  ]);

  if (!selectedItem || !currentLevel) {
    return null;
  }

  const completedChecks = Object.values(practice.checks).filter(Boolean).length;

  function switchMode(nextMode: Mode) {
    const nextItems = getItems(data, nextMode);

    setMode(nextMode);
    setCategory("all");
    setSelectedId(nextItems[0]?.id ?? "");
    setSelectedLevel(nextItems[0]?.levels[0]?.level ?? "L1");
  }

  async function requestReview(item: PracticeItem, level: PracticeLevel) {
    if (!practice.answer.trim()) {
      return;
    }

    setReviewState("loading");

    const response = await fetch("/api/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cardId: item.id,
        level: level.level,
        promptJa: item.promptJa,
        promptEn: item.promptEn,
        modelAnswerEn: level.modelAnswerEn,
        reviewPoints: level.reviewPoints || level.focus,
        userAnswer: practice.answer,
      }),
    });

    if (!response.ok) {
      setReviewState("error");
      return;
    }

    const review = (await response.json()) as ReviewResult;

    setPractice((current) => ({
      ...current,
      review,
    }));
    setReviewState("idle");
  }

  return (
    <section className="workbench" aria-label="Scene Builder practice">
      <div className="toolbar">
        <div className="segmented-control" aria-label="Practice mode">
          <button
            className={mode === "topic" ? "active" : ""}
            type="button"
            onClick={() => switchMode("topic")}
          >
            <BookOpen aria-hidden="true" size={17} />
            Topic
          </button>
          <button
            className={mode === "diary" ? "active" : ""}
            type="button"
            onClick={() => switchMode("diary")}
          >
            <PenLine aria-hidden="true" size={17} />
            Diary
          </button>
        </div>

        <div className="category-row" aria-label="Category">
          <button
            className={category === "all" ? "active" : ""}
            type="button"
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {categories.map((candidate) => (
            <button
              className={category === candidate ? "active" : ""}
              key={candidate}
              type="button"
              onClick={() => setCategory(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>

      <div className="app-grid">
        <aside className="item-list" aria-label="Cards">
          {filteredItems.map((item) => (
            <button
              className={`item-card ${item.id === selectedItem.id ? "active" : ""}`}
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedId(item.id);
                setSelectedLevel(item.levels[0].level);
              }}
            >
              <span className="item-meta">{item.category}</span>
              <strong>{item.sceneJa}</strong>
              <span>{item.promptEn}</span>
            </button>
          ))}
        </aside>

        <section className="practice-panel" aria-label="Practice">
          <div className="prompt-block">
            <span className="item-meta">{selectedItem.id}</span>
            <h1>{selectedItem.sceneJa}</h1>
            <p lang="en">{selectedItem.promptEn}</p>
            <p>{selectedItem.promptJa}</p>
          </div>

          <div className="level-row" aria-label="Difficulty">
            {selectedItem.levels.map((level) => (
              <button
                className={currentLevel.level === level.level ? "active" : ""}
                key={level.level}
                type="button"
                onClick={() => setSelectedLevel(level.level)}
              >
                {level.level}
                <span>{level.levelName}</span>
              </button>
            ))}
          </div>

          <label className="answer-field">
            <span>My answer</span>
            <textarea
              lang="en"
              placeholder="I practiced ollies today."
              value={practice.answer}
              onChange={(event) =>
                setPractice((current) => ({
                  ...current,
                  answer: event.target.value,
                }))
              }
            />
          </label>

          <div className="action-row">
            <button
              className="primary-button"
              disabled={!canUseReview || !practice.answer.trim() || reviewState === "loading"}
              type="button"
              onClick={() => requestReview(selectedItem, currentLevel)}
            >
              <Sparkles aria-hidden="true" size={18} />
              {reviewState === "loading" ? "Reviewing" : "Grok review"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setPractice(createInitialPractice())}
            >
              <RotateCcw aria-hidden="true" size={18} />
              Reset
            </button>
            <span className={`sync-pill ${syncState}`}>{syncLabel(syncState)}</span>
          </div>

          {reviewState === "error" ? (
            <p className="inline-alert">Grok review failed. Check Vercel env and xAI billing.</p>
          ) : null}

          {practice.review ? (
            <div className="review-result" aria-label="Review result">
              <div>
                <span className="score">{practice.review.score}/10</span>
                <p>{practice.review.goodPoint}</p>
              </div>
              <dl>
                <dt>Fix</dt>
                <dd lang="en">{practice.review.fix}</dd>
                <dt>Natural</dt>
                <dd lang="en">{practice.review.naturalAnswer}</dd>
                <dt>Phrase</dt>
                <dd lang="en">{practice.review.phraseToRemember}</dd>
                <dt>Next</dt>
                <dd>{practice.review.nextPractice}</dd>
              </dl>
            </div>
          ) : null}
        </section>

        <aside className="side-panel" aria-label="Model answer and checks">
          <section>
            <div className="panel-heading">
              <ClipboardCheck aria-hidden="true" size={18} />
              <h2>Self check</h2>
            </div>
            <div className="check-list">
              {checkItems.map((item) => (
                <label key={item.key}>
                  <input
                    checked={practice.checks[item.key]}
                    type="checkbox"
                    onChange={(event) =>
                      setPractice((current) => ({
                        ...current,
                        checks: {
                          ...current.checks,
                          [item.key]: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <div className="progress-line">
              <span>{completedChecks}/5</span>
              <div>
                <i style={{ width: `${(completedChecks / 5) * 100}%` }} />
              </div>
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <CheckCircle2 aria-hidden="true" size={18} />
              <h2>Status</h2>
            </div>
            <div className="status-row">
              {(["new", "learned", "review"] as Status[]).map((status) => (
                <button
                  className={practice.status === status ? "active" : ""}
                  key={status}
                  type="button"
                  onClick={() =>
                    setPractice((current) => ({
                      ...current,
                      status,
                    }))
                  }
                >
                  {statusLabel(status)}
                </button>
              ))}
            </div>
          </section>

          <section className="model-answer">
            <div className="panel-heading">
              <BookOpen aria-hidden="true" size={18} />
              <h2>Model</h2>
            </div>
            <p lang="en">{currentLevel.modelAnswerEn}</p>
            <p>{currentLevel.modelAnswerJa}</p>
            {currentLevel.constraints ? <small>{currentLevel.constraints}</small> : null}
            {currentLevel.reviewPoints ? <small>{currentLevel.reviewPoints}</small> : null}
            {currentLevel.focus ? <small>{currentLevel.focus}</small> : null}
          </section>

          <section className="vocab-strip">
            <h2>Vocabulary</h2>
            {data.vocabulary.slice(0, 6).map((item) => (
              <div className="vocab-item" key={item.term}>
                <strong lang="en">{item.term}</strong>
                <span>{item.meaningJa}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}
