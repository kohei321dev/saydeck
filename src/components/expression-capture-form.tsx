"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { variantDisplayName } from "@/lib/generation-profiles";
import type {
  ExpressionEntryDetail,
  SentenceVariant,
  SituationDefinition,
  SituationSuggestion,
} from "@/lib/expression-types";

const captureQueueKey = "saydeck.capture-queue.v2";
const newPrimaryValue = "__new_primary__";

type CaptureQueue = {
  inputJa: string;
  preferredPrimarySituationId: string;
};

type Props = {
  primarySituations: SituationDefinition[];
  initialQueue?: CaptureQueue | null;
};

export function ExpressionCaptureForm({
  primarySituations,
  initialQueue = null,
}: Props) {
  const [inputJa, setInputJa] = useState(initialQueue?.inputJa ?? "");
  const [preferredPrimarySituationId, setPreferredPrimarySituationId] = useState(
    initialQueue?.preferredPrimarySituationId ?? "",
  );
  const [entry, setEntry] = useState<ExpressionEntryDetail | null>(null);
  const [suggestion, setSuggestion] = useState<SituationSuggestion | null>(null);
  const [primaryChoice, setPrimaryChoice] = useState("");
  const [primaryLabelJa, setPrimaryLabelJa] = useState("");
  const [secondaryLabelJa, setSecondaryLabelJa] = useState("");
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<
    "idle" | "saving" | "generating" | "approving" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    initialQueue ? "未同期の入力を復元しました。保存を再試行してください。" : null,
  );

  useEffect(() => {
    if (initialQueue) return;

    try {
      const raw = window.localStorage.getItem(captureQueueKey);
      if (!raw) return;
      const queued = JSON.parse(raw) as Partial<CaptureQueue>;
      setInputJa(queued.inputJa ?? "");
      setPreferredPrimarySituationId(queued.preferredPrimarySituationId ?? "");
      setNotice("未同期の入力を復元しました。保存を再試行してください。");
    } catch {
      window.localStorage.removeItem(captureQueueKey);
    }
  }, [initialQueue]);

  async function captureAndGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const queue = {
      inputJa: inputJa.trim(),
      preferredPrimarySituationId,
    };

    if (!queue.inputJa) {
      setError("言いたいことを入力してください。");
      return;
    }

    setEntry(null);
    setSuggestion(null);
    setSelectedVariantIds(new Set());
    persistQueue(queue);
    setPhase("saving");

    try {
      const created = await requestJson<{ entry: ExpressionEntryDetail }>(
        "/api/expressions",
        {
          method: "POST",
          body: JSON.stringify({ inputJa: queue.inputJa }),
        },
      );

      window.localStorage.removeItem(captureQueueKey);
      setEntry(created.entry);
      await generateEntry(created.entry);
    } catch (caught) {
      const message = getErrorMessage(caught);
      if (caught instanceof Error && caught.message === "database_not_configured") {
        setNotice("DB未設定のため、入力を端末へ退避しました。設定後に再試行できます。");
      } else if (caught instanceof Error && caught.message === "network_error") {
        setNotice("通信できなかったため、入力を端末へ退避しました。");
      }
      setError(message);
      setPhase("idle");
    }
  }

  async function generateEntry(target: ExpressionEntryDetail) {
    setError(null);
    setPhase("generating");

    try {
      const generated = await requestJson<{
        entry: ExpressionEntryDetail;
        situationSuggestion: SituationSuggestion;
      }>(
        `/api/expressions/${encodeURIComponent(target.id)}/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            preferredPrimarySituationId: preferredPrimarySituationId || undefined,
          }),
        },
      );
      const variants = generated.entry.sentenceCards.flatMap(
        (card) => card.variants ?? [],
      );
      setEntry(generated.entry);
      setSelectedVariantIds(new Set(variants.map((variant) => variant.id)));
      applySituationSuggestion(generated.situationSuggestion);
      setNotice("英文とシチュエーション候補を作成しました。内容を確認して保存してください。");
    } catch (caught) {
      setError(getErrorMessage(caught));
      setNotice("日本語入力は保存済みです。設定を確認して候補生成を再試行できます。");
    } finally {
      setPhase("idle");
    }
  }

  function applySituationSuggestion(nextSuggestion: SituationSuggestion) {
    setSuggestion(nextSuggestion);
    setPrimaryChoice(nextSuggestion.primarySituationId ?? newPrimaryValue);
    setPrimaryLabelJa(nextSuggestion.primaryLabelJa);
    setSecondaryLabelJa(nextSuggestion.secondaryBaseLabelJa);
  }

  function changePrimaryChoice(value: string) {
    setPrimaryChoice(value);
    if (value === newPrimaryValue) {
      setPrimaryLabelJa(suggestion?.primarySituationId ? "" : suggestion?.primaryLabelJa ?? "");
      return;
    }
    setPrimaryLabelJa(
      primarySituations.find((situation) => situation.id === value)?.labelJa ?? "",
    );
  }

  async function approve() {
    if (!entry || selectedVariantIds.size === 0) {
      setError("登録する表現を1つ以上選択してください。");
      return;
    }

    const primarySituationId = primaryChoice === newPrimaryValue
      ? undefined
      : primaryChoice || undefined;
    const normalizedPrimaryLabel = primaryLabelJa.trim();
    const normalizedSecondaryLabel = secondaryLabelJa.trim();

    if ((!primarySituationId && !normalizedPrimaryLabel) || !normalizedSecondaryLabel) {
      setError("主・副シチュエーションを確認してください。");
      return;
    }

    setError(null);
    setPhase("approving");

    const situationSelectedBy = suggestion
      && suggestion.primarySituationId === (primarySituationId ?? null)
      && suggestion.primaryLabelJa === normalizedPrimaryLabel
      && suggestion.secondaryBaseLabelJa === normalizedSecondaryLabel
      ? "ai"
      : "user";

    try {
      const result = await requestJson<{ entry: ExpressionEntryDetail }>(
        `/api/expressions/${encodeURIComponent(entry.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            selectedVariantIds: Array.from(selectedVariantIds),
            primarySituationId,
            primarySituationLabelJa: normalizedPrimaryLabel,
            secondarySituationLabelJa: normalizedSecondaryLabel,
            situationSelectedBy,
            variants: entry.sentenceCards.flatMap((card) =>
              (card.variants ?? []).map((variant) => ({
                id: variant.id,
                expressionEn: variant.expressionEn,
                translationJa: variant.translationJa,
              })),
            ),
          }),
        },
      );
      setEntry(result.entry);
      setNotice("カードを保存しました。LISTSで確認し、必要な表現をAPKGへ出力できます。");
      setPhase("done");
    } catch (caught) {
      setError(getErrorMessage(caught));
      setPhase("idle");
    }
  }

  function toggleVariant(variant: SentenceVariant) {
    if (variant.profileCode === "basic") return;
    setSelectedVariantIds((current) => {
      const next = new Set(current);
      if (next.has(variant.id)) next.delete(variant.id);
      else next.add(variant.id);
      return next;
    });
  }

  const generatedCards = entry?.sentenceCards.filter((card) =>
    (card.variants ?? []).some((variant) => variant.expressionEn.trim()),
  ) ?? [];
  const hasGeneratedCandidates = generatedCards.length > 0;

  return (
    <main className="capture-page">
      <section className="capture-intro">
        <p className="eyebrow">INPUT</p>
        <h1>言いたいことから、使える英語を作る</h1>
        <p>
          日本語で言いたいことを入力すると、必要な意味単位に分けて、Ankiで振り返れる英語表現を作ります。
        </p>
      </section>

      <form className="capture-form" onSubmit={captureAndGenerate}>
        <label className="capture-field capture-field-primary">
          <span>言いたいこと（日本語）</span>
          <textarea
            autoFocus
            maxLength={2000}
            onChange={(event) => setInputJa(event.target.value)}
            placeholder="例：仕事が長引いていて30分ほど遅れそうです。先に始めていてください。着いたら連絡します。"
            required
            rows={5}
            value={inputJa}
          />
          <small>{inputJa.length}/2000</small>
        </label>
        <label className="capture-field">
          <span>主シチュエーション（任意）</span>
          <select
            onChange={(event) => setPreferredPrimarySituationId(event.target.value)}
            value={preferredPrimarySituationId}
          >
            <option value="">AIに判断してもらう</option>
            {primarySituations.map((situation) => (
              <option key={situation.id} value={situation.id}>
                {situation.labelJa}
              </option>
            ))}
          </select>
          <small>以前使った場面があれば優先できます。最終分類は生成後に確認します。</small>
        </label>
        <button
          className="primary-button capture-submit"
          disabled={phase === "saving" || phase === "generating"}
          type="submit"
        >
          {phase === "saving"
            ? "入力を保存中…"
            : phase === "generating"
              ? "英語表現を作成中…"
              : "英語表現を作る"}
        </button>
      </form>

      {notice ? <p className="capture-notice" role="status">{notice}</p> : null}
      {error ? <p className="error-note capture-error" role="alert">{error}</p> : null}

      {entry && !hasGeneratedCandidates ? (
        <section className="capture-review">
          <h2>日本語入力は保存済みです</h2>
          <p className="field-hint">
            英語表現はまだ作成されていません。そのまま再試行できます。
          </p>
          <div className="capture-review-actions">
            <button
              className="secondary-button"
              disabled={phase === "generating"}
              onClick={() => void generateEntry(entry)}
              type="button"
            >
              {phase === "generating" ? "作成中…" : "英語表現をもう一度作る"}
            </button>
          </div>
        </section>
      ) : null}

      {entry && hasGeneratedCandidates ? (
        <section className="capture-review" aria-labelledby="capture-review-title">
          <div className="capture-review-heading">
            <div>
              <p className="eyebrow">REVIEW</p>
              <h2 id="capture-review-title">分類と英語表現を確認する</h2>
            </div>
            <span className="capture-count">{selectedVariantIds.size}枚を保存予定</span>
          </div>

          <div className="capture-situation-review">
            <label className="capture-field">
              <span>主シチュエーション</span>
              <select
                onChange={(event) => changePrimaryChoice(event.target.value)}
                value={primaryChoice}
              >
                {primarySituations.map((situation) => (
                  <option key={situation.id} value={situation.id}>
                    {situation.labelJa}
                  </option>
                ))}
                <option value={newPrimaryValue}>新しい主シチュエーションを作る</option>
              </select>
            </label>
            {primaryChoice === newPrimaryValue ? (
              <label className="capture-field">
                <span>新しい主シチュエーション名</span>
                <input
                  maxLength={120}
                  onChange={(event) => setPrimaryLabelJa(event.target.value)}
                  required
                  value={primaryLabelJa}
                />
              </label>
            ) : null}
            <label className="capture-field">
              <span>副シチュエーション</span>
              <input
                maxLength={120}
                onChange={(event) => setSecondaryLabelJa(event.target.value)}
                required
                value={secondaryLabelJa}
              />
            </label>
            <p className="field-hint">
              同じ主の配下に同名の副シチュエーションがある場合、保存時に
              <code>-001</code>以降の連番を付けます。
            </p>
          </div>

          {generatedCards.map((card, cardIndex) => (
            <article className="capture-segment" key={card.id}>
              <div className="capture-segment-heading">
                <span>{String(cardIndex + 1).padStart(2, "0")}</span>
                <h3>{card.intentJa}</h3>
              </div>
              <div className="capture-variants">
                {(card.variants ?? []).map((variant) => {
                  const isBasic = variant.profileCode === "basic";
                  return (
                    <label
                      className={
                        selectedVariantIds.has(variant.id)
                          ? "capture-variant selected"
                          : "capture-variant"
                      }
                      key={variant.id}
                    >
                      <input
                        aria-label={`${variantDisplayName(variant.profileCode, variant.patternCode)}をカードへ追加する`}
                        checked={selectedVariantIds.has(variant.id)}
                        disabled={isBasic}
                        onChange={() => toggleVariant(variant)}
                        type="checkbox"
                      />
                      <span className="capture-variant-level">
                        {variantDisplayName(variant.profileCode, variant.patternCode)}
                      </span>
                      <span className="capture-variant-copy">
                        <strong lang="en">{variant.expressionEn}</strong>
                        <span>{variant.translationJa}</span>
                        {isBasic ? <small>必須</small> : <small>任意</small>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
          <p className="field-hint">
            01_基本表現は必須です。02〜04は実用上の差があるとAIが判断した場合だけ表示されます。
          </p>
          <div className="capture-review-actions">
            <button
              className="primary-button"
              disabled={phase === "approving" || phase === "done"}
              onClick={() => void approve()}
              type="button"
            >
              {phase === "approving"
                ? "保存中…"
                : phase === "done"
                  ? "保存済み"
                  : "この内容でカードを保存"}
            </button>
            {phase === "done" ? (
              <Link className="secondary-button" href="/lists">
                LISTSを見る
              </Link>
            ) : null}
          </div>
          {phase === "done" && entry.primarySituation && entry.secondarySituation ? (
            <p className="capture-saved-context">
              {String(entry.situationSequence ?? 0).padStart(3, "0")} ·{" "}
              {entry.primarySituation.labelJa} › {entry.secondarySituation.labelJa}
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error("network_error");
  }

  const data = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    const error = new Error(data?.error?.code ?? "request_failed");
    error.name = data?.error?.message ?? "request_failed";
    throw error;
  }
  return data as T;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "処理に失敗しました。時間を置いて再試行してください。";
  }
  if (error.message === "network_error") {
    return "通信できませんでした。入力は端末に退避しています。";
  }
  return error.name !== "request_failed"
    ? error.name
    : "処理に失敗しました。時間を置いて再試行してください。";
}

function persistQueue(payload: CaptureQueue) {
  try {
    window.localStorage.setItem(captureQueueKey, JSON.stringify(payload));
  } catch {
    // A private browsing context may reject localStorage. The API error remains visible.
  }
}
