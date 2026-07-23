"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type {
  ExpressionEntryDetail,
  SentenceVariant,
} from "@/lib/expression-types";

const captureQueueKey = "saydeck.capture-queue.v1";

type CaptureQueue = {
  inputJa: string;
  genreSlug: string;
};

type GenreMode = "" | "daily" | "skateboarding" | "other";

type Props = {
  initialQueue?: CaptureQueue | null;
};

export function ExpressionCaptureForm({ initialQueue = null }: Props) {
  const [inputJa, setInputJa] = useState(initialQueue?.inputJa ?? "");
  const [genreMode, setGenreMode] = useState<GenreMode>(() => getGenreMode(initialQueue?.genreSlug));
  const [otherGenre, setOtherGenre] = useState(() => getOtherGenre(initialQueue?.genreSlug));
  const [entry, setEntry] = useState<ExpressionEntryDetail | null>(null);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"idle" | "saving" | "generating" | "approving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialQueue ? "未同期の入力を復元しました。保存を再試行してください。" : null);

  useEffect(() => {
    if (initialQueue) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(captureQueueKey);
      if (!raw) return;
      const queued = JSON.parse(raw) as CaptureQueue;
      setInputJa(queued.inputJa ?? "");
      setGenreMode(getGenreMode(queued.genreSlug));
      setOtherGenre(getOtherGenre(queued.genreSlug));
      setNotice("未同期の入力を復元しました。保存を再試行してください。");
    } catch {
      window.localStorage.removeItem(captureQueueKey);
    }
  }, [initialQueue]);

  async function captureAndGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const payload = {
      inputJa: inputJa.trim(),
      genreSlug: selectedGenre(genreMode, otherGenre),
    };

    if (!payload.inputJa) {
      setError("言いたいことを入力してください。");
      return;
    }

    setEntry(null);
    setSelectedVariantIds(new Set());
    persistQueue(payload);
    setPhase("saving");

    try {
      const created = await requestJson<{ entry: ExpressionEntryDetail }>(
        "/api/expressions",
        { method: "POST", body: JSON.stringify(payload) },
      );

      window.localStorage.removeItem(captureQueueKey);
      applyEntry(created.entry);
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
      const generated = await requestJson<{ entry: ExpressionEntryDetail }>(
        `/api/expressions/${encodeURIComponent(target.id)}/generate`,
        { method: "POST" },
      );
      const variants = generated.entry.sentenceCards.flatMap((card) => card.variants ?? []);
      applyEntry(generated.entry);
      setSelectedVariantIds(new Set(variants.map((variant) => variant.id)));
      setNotice("英文候補を作成しました。追加するレベルを選んでください。");
    } catch (caught) {
      setError(getErrorMessage(caught));
      setNotice("入力は保存済みです。設定を確認して候補生成を再試行できます。");
    } finally {
      setPhase("idle");
    }
  }

  async function approve() {
    if (!entry || selectedVariantIds.size === 0) {
      setError("登録するレベルを1つ以上選択してください。");
      return;
    }

    setError(null);
    setPhase("approving");

    try {
      const result = await requestJson<{ entry: ExpressionEntryDetail }>(
        `/api/expressions/${encodeURIComponent(entry.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            selectedVariantIds: Array.from(selectedVariantIds),
            genreSlug: entry.genreSlug,
            variants: entry.sentenceCards.flatMap((card) => (card.variants ?? []).map((variant) => ({
              id: variant.id,
              english: variant.english,
              japanese: variant.japanese,
              keyExpression: variant.keyExpression,
              definitionJa: variant.definitionJa,
              irregularForms: variant.irregularForms,
            }))),
          }),
        },
      );
      applyEntry(result.entry);
      setNotice("表現を保存しました。LISTSで選択してAPKGを作成できます。");
      setPhase("done");
    } catch (caught) {
      setError(getErrorMessage(caught));
      setPhase("idle");
    }
  }

  function toggleVariant(variant: SentenceVariant) {
    setSelectedVariantIds((current) => {
      const next = new Set(current);
      if (next.has(variant.id)) next.delete(variant.id);
      else next.add(variant.id);
      return next;
    });
  }

  function applyEntry(nextEntry: ExpressionEntryDetail) {
    setEntry(nextEntry);
  }

  const generatedCards = entry?.sentenceCards.filter((card) =>
    (card.variants ?? []).some((variant) => variant.english.trim()),
  ) ?? [];
  const hasGeneratedCandidates = generatedCards.length > 0;

  return (
    <main className="capture-page">
      <section className="capture-intro">
        <p className="eyebrow">QUICK CAPTURE</p>
        <h1>言いたいことを、すぐカードにする</h1>
        <p>スケートボード中や移動中に思いついた表現を、日本語のまま保存できます。</p>
      </section>

      <form className="capture-form" onSubmit={captureAndGenerate}>
        <label className="capture-field capture-field-primary">
          <span>言いたいこと（日本語）</span>
          <textarea
            autoFocus
            maxLength={2000}
            onChange={(event) => setInputJa(event.target.value)}
            placeholder="例：今日は少しだけ練習して帰りたい"
            required
            rows={4}
            value={inputJa}
          />
          <small>{inputJa.length}/2000</small>
        </label>
        <div className="capture-form-grid">
          <label className="capture-field">
            <span>ジャンル（任意）</span>
            <select onChange={(event) => setGenreMode(event.target.value as GenreMode)} value={genreMode}>
              <option value="">指定なし（AIに任せる）</option>
              <option value="daily">日常生活</option>
              <option value="skateboarding">スケートボード</option>
              <option value="other">その他</option>
            </select>
          </label>
          {genreMode === "other" ? <label className="capture-field"><span>その他のジャンル</span><input maxLength={120} onChange={(event) => setOtherGenre(event.target.value)} placeholder="travel" value={otherGenre} /></label> : null}
        </div>
        <button className="primary-button capture-submit" disabled={phase === "saving" || phase === "generating"} type="submit">
          {phase === "saving" ? "準備中…" : phase === "generating" ? "英文候補を作成中…" : "英文候補を作る"}
        </button>
      </form>

      {notice ? <p className="capture-notice" role="status">{notice}</p> : null}
      {error ? <p className="error-note capture-error" role="alert">{error}</p> : null}

      {entry && !hasGeneratedCandidates ? (
        <section className="capture-review">
          <h2>入力は保存しました</h2>
          <p className="field-hint">英文候補はまだ作成されていません。日本語入力は保存済みなので、そのまま再試行できます。</p>
          <div className="capture-review-actions">
            <button className="secondary-button" disabled={phase === "generating"} onClick={() => void generateEntry(entry)} type="button">
              {phase === "generating" ? "候補を作成中…" : "英文候補をもう一度作る"}
            </button>
          </div>
        </section>
      ) : null}

      {entry && hasGeneratedCandidates ? (
        <section className="capture-review" aria-labelledby="capture-review-title">
          <div className="capture-review-heading">
            <div>
              <p className="eyebrow">REVIEW</p>
              <h2 id="capture-review-title">英文候補を確認する</h2>
            </div>
            <span className="capture-count">{selectedVariantIds.size}件を登録予定</span>
          </div>
          {generatedCards.map((card) => (
            <article className="capture-segment" key={card.id}>
              <h3>{card.intentJa}</h3>
              <div className="capture-variants">
                {(card.variants ?? []).map((variant) => (
                  <label className={selectedVariantIds.has(variant.id) ? "capture-variant selected" : "capture-variant"} key={variant.id}>
                    <input aria-label={`${variant.profileCode}をカードへ追加する`} checked={selectedVariantIds.has(variant.id)} onChange={() => toggleVariant(variant)} type="checkbox" />
                    <span className="capture-variant-level">{variant.profileCode}</span>
                    <span className="capture-variant-copy">
                      <strong>{variant.english}</strong>
                      <span>{variant.japanese}</span>
                      <small>基本ワード: {variant.keyExpression}</small>
                    </span>
                  </label>
                ))}
              </div>
            </article>
          ))}
          <p className="field-hint">英文や分類の編集は、カード追加後にLISTSから行えます。</p>
          <div className="capture-review-actions">
          <button className="primary-button" disabled={phase === "approving"} onClick={() => void approve()} type="button">
              {phase === "approving" ? "保存中…" : phase === "done" ? "保存済み" : "カードを保存"}
            </button>
            {phase === "done" ? <Link className="secondary-button" href="/lists">LISTSを見る</Link> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  } catch {
    throw new Error("network_error");
  }

  const data = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    const error = new Error(data?.error?.code ?? "request_failed");
    error.name = data?.error?.message ?? "request_failed";
    throw error;
  }
  return data as T;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "処理に失敗しました。時間を置いて再試行してください。";
  if (error.message === "network_error") return "通信できませんでした。入力は端末に退避しています。";
  return error.name !== "request_failed" ? error.name : "処理に失敗しました。時間を置いて再試行してください。";
}

function persistQueue(payload: CaptureQueue) {
  try {
    window.localStorage.setItem(captureQueueKey, JSON.stringify(payload));
  } catch {
    // A private browsing context may reject localStorage. The API error remains visible.
  }
}

function getGenreMode(genreSlug: string | undefined): GenreMode {
  if (genreSlug === "daily" || genreSlug === "skateboarding") return genreSlug;
  return genreSlug ? "other" : "";
}

function getOtherGenre(genreSlug: string | undefined): string {
  return genreSlug === "daily" || genreSlug === "skateboarding" ? "" : genreSlug ?? "";
}

function selectedGenre(mode: GenreMode, otherGenre: string): string {
  return mode === "other" ? otherGenre.trim() : mode;
}
