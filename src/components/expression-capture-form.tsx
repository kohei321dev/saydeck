"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Combine, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  ExpressionEntryDetail,
  SentenceVariant,
} from "@/lib/expression-types";

const captureQueueKey = "saydeck.capture-queue.v1";

type CaptureQueue = {
  inputJa: string;
  situationJa: string;
  genreSlug: string;
  situationTags: string;
};

type SegmentDraft = {
  id: string;
  intentJa: string;
};

type Props = {
  initialQueue?: CaptureQueue | null;
};

export function ExpressionCaptureForm({ initialQueue = null }: Props) {
  const [inputJa, setInputJa] = useState(initialQueue?.inputJa ?? "");
  const [situationJa, setSituationJa] = useState(initialQueue?.situationJa ?? "");
  const [genreSlug, setGenreSlug] = useState(initialQueue?.genreSlug ?? "");
  const [situationTags, setSituationTags] = useState(initialQueue?.situationTags ?? "");
  const [entry, setEntry] = useState<ExpressionEntryDetail | null>(null);
  const [segmentDrafts, setSegmentDrafts] = useState<SegmentDraft[]>([]);
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
      setSituationJa(queued.situationJa ?? "");
      setGenreSlug(queued.genreSlug ?? "");
      setSituationTags(queued.situationTags ?? "");
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
      situationJa: situationJa.trim(),
      genreSlug: genreSlug.trim(),
      situationTags,
    };

    if (!payload.inputJa || !payload.situationJa) {
      setError("言いたいこととシチュエーションを入力してください。");
      return;
    }

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

  async function generateEntry(target: ExpressionEntryDetail, segmentIntents?: string[]) {
    setError(null);
    setPhase("generating");

    try {
      const generated = await requestJson<{ entry: ExpressionEntryDetail }>(
        `/api/expressions/${encodeURIComponent(target.id)}/generate`,
        {
          method: "POST",
          body: segmentIntents ? JSON.stringify({ segmentIntents }) : undefined,
        },
      );
      const variants = generated.entry.sentenceCards.flatMap((card) => card.variants ?? []);
      applyEntry(generated.entry);
      setSelectedVariantIds(new Set(variants.map((variant) => variant.id)));
      setNotice(segmentIntents ? "意味単位に合わせて候補を作り直しました。" : "候補を作成しました。残したいレベルを選んでください。");
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
            situationTags: entry.situationTags,
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

  function updateVariant(variantId: string, field: "english" | "japanese" | "keyExpression" | "definitionJa" | "irregularForms", value: string) {
    setEntry((current) => current ? {
      ...current,
      sentenceCards: current.sentenceCards.map((card) => ({
        ...card,
        variants: (card.variants ?? []).map((variant) => variant.id === variantId ? { ...variant, [field]: value } : variant),
      })),
    } : current);
  }

  function updateEntryMetadata(field: "genreSlug" | "situationTags", value: string) {
    setEntry((current) => current ? {
      ...current,
      [field]: field === "situationTags" ? value.split(/[;,]/).map((tag) => tag.trim()).filter(Boolean) : value,
    } : current);
  }

  function applyEntry(nextEntry: ExpressionEntryDetail) {
    setEntry(nextEntry);
    setSegmentDrafts(nextEntry.sentenceCards.map((card) => ({ id: card.id, intentJa: card.intentJa })));
  }

  function updateSegment(index: number, value: string) {
    setSegmentDrafts((current) => current.map((segment, currentIndex) =>
      currentIndex === index ? { ...segment, intentJa: value } : segment,
    ));
  }

  function addSegmentAfter(index: number) {
    setSegmentDrafts((current) => current.length >= 4 ? current : [
      ...current.slice(0, index + 1),
      { id: `new-${crypto.randomUUID()}`, intentJa: "" },
      ...current.slice(index + 1),
    ]);
  }

  function mergeWithNext(index: number) {
    setSegmentDrafts((current) => {
      if (!current[index + 1]) return current;
      const merged = [current[index].intentJa, current[index + 1].intentJa]
        .map((value) => value.trim()).filter(Boolean).join("。 ");
      return [...current.slice(0, index), { ...current[index], intentJa: merged }, ...current.slice(index + 2)];
    });
  }

  function moveSegment(index: number, direction: -1 | 1) {
    setSegmentDrafts((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function regenerateSegments() {
    if (!entry) return;
    const intents = segmentDrafts.map((segment) => segment.intentJa.trim()).filter(Boolean);
    if (intents.length === 0 || intents.length > 4) {
      setError("意味単位は1〜4件で入力してください。");
      return;
    }
    void generateEntry(entry, intents);
  }

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
            <span>シチュエーション（日本語）</span>
            <input maxLength={1000} onChange={(event) => setSituationJa(event.target.value)} placeholder="例：スケートパークで友達に話す" required value={situationJa} />
          </label>
          <label className="capture-field">
            <span>ジャンル（任意）</span>
            <input maxLength={120} onChange={(event) => setGenreSlug(event.target.value)} placeholder="skate / daily / travel" value={genreSlug} />
          </label>
        </div>
        <label className="capture-field">
          <span>シチュエーションタグ（任意）</span>
          <input onChange={(event) => setSituationTags(event.target.value)} placeholder="友達, 練習, 帰宅" value={situationTags} />
        </label>
        <button className="primary-button capture-submit" disabled={phase === "saving" || phase === "generating"} type="submit">
          {phase === "saving" ? "保存中…" : phase === "generating" ? "AIが候補を作成中…" : "保存して英文候補を作る"}
        </button>
      </form>

      {notice ? <p className="capture-notice" role="status">{notice}</p> : null}
      {error ? <p className="error-note capture-error" role="alert">{error}</p> : null}

      {entry && entry.sentenceCards.length === 0 ? (
        <section className="capture-review">
          <h2>入力は保存しました</h2>
          <p className="field-hint">候補生成に失敗しても、日本語入力は保存済みです。</p>
          <div className="capture-review-actions">
            <button className="secondary-button" disabled={phase === "generating"} onClick={() => void generateEntry(entry)} type="button">
              {phase === "generating" ? "候補を作成中…" : "英文候補を再生成"}
            </button>
          </div>
        </section>
      ) : null}

      {entry?.sentenceCards.length ? (
        <section className="capture-review" aria-labelledby="capture-review-title">
          <div className="capture-review-heading">
            <div>
              <p className="eyebrow">REVIEW</p>
              <h2 id="capture-review-title">英文候補を確認する</h2>
            </div>
            <span className="capture-count">{selectedVariantIds.size}件を登録予定</span>
          </div>
          <div className="capture-ai-metadata">
            <label className="capture-inline-editor"><span>ジャンル</span><input value={entry.genreSlug} onChange={(event) => updateEntryMetadata("genreSlug", event.target.value)} /></label>
            <label className="capture-inline-editor"><span>タグ</span><input value={entry.situationTags.join(", ")} onChange={(event) => updateEntryMetadata("situationTags", event.target.value)} /></label>
          </div>
          <section className="segment-editor" aria-labelledby="segment-editor-title">
            <div>
              <h3 id="segment-editor-title">意味単位を調整する</h3>
              <p>1件が1枚のカードになります。調整後に候補を作り直します。</p>
            </div>
            <div className="segment-editor-list">
              {segmentDrafts.map((segment, index) => (
                <div className="segment-editor-row" key={segment.id}>
                  <span>{index + 1}</span>
                  <textarea aria-label={`意味単位 ${index + 1}`} maxLength={2000} onChange={(event) => updateSegment(index, event.target.value)} rows={2} value={segment.intentJa} />
                  <div className="segment-editor-actions">
                    <button aria-label="上へ移動" className="icon-button" disabled={index === 0 || phase === "generating"} onClick={() => moveSegment(index, -1)} title="上へ移動" type="button"><ArrowUp aria-hidden="true" size={16} /></button>
                    <button aria-label="下へ移動" className="icon-button" disabled={index === segmentDrafts.length - 1 || phase === "generating"} onClick={() => moveSegment(index, 1)} title="下へ移動" type="button"><ArrowDown aria-hidden="true" size={16} /></button>
                    <button aria-label="下に意味単位を追加" className="icon-button" disabled={segmentDrafts.length >= 4 || phase === "generating"} onClick={() => addSegmentAfter(index)} title="下に意味単位を追加" type="button"><Plus aria-hidden="true" size={16} /></button>
                    <button aria-label="次の意味単位と結合" className="icon-button" disabled={index === segmentDrafts.length - 1 || phase === "generating"} onClick={() => mergeWithNext(index)} title="次の意味単位と結合" type="button"><Combine aria-hidden="true" size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
            <button className="secondary-button" disabled={phase === "generating"} onClick={regenerateSegments} type="button">
              {phase === "generating" ? "候補を作成中…" : "この意味単位で候補を作り直す"}
            </button>
          </section>
          {entry.sentenceCards.map((card) => (
            <article className="capture-segment" key={card.id}>
              <h3>{card.intentJa}</h3>
              <div className="capture-variants">
                {(card.variants ?? []).map((variant) => (
                  <label className={selectedVariantIds.has(variant.id) ? "capture-variant selected" : "capture-variant"} key={variant.id}>
                    <input checked={selectedVariantIds.has(variant.id)} onChange={() => toggleVariant(variant)} type="checkbox" />
                    <span className="capture-variant-level">{variant.profileCode}</span>
                    <span className="capture-variant-copy">
                      <input aria-label={`${variant.profileCode} 英文`} className="capture-inline-input" onChange={(event) => updateVariant(variant.id, "english", event.target.value)} value={variant.english} />
                      <input aria-label={`${variant.profileCode} 和訳`} className="capture-inline-input" onChange={(event) => updateVariant(variant.id, "japanese", event.target.value)} value={variant.japanese} />
                      <input aria-label={`${variant.profileCode} Word`} className="capture-inline-input" onChange={(event) => updateVariant(variant.id, "keyExpression", event.target.value)} value={variant.keyExpression} />
                      <input aria-label={`${variant.profileCode} Definition`} className="capture-inline-input" onChange={(event) => updateVariant(variant.id, "definitionJa", event.target.value)} value={variant.definitionJa} />
                      <input aria-label={`${variant.profileCode} Irregular Forms`} className="capture-inline-input" onChange={(event) => updateVariant(variant.id, "irregularForms", event.target.value)} value={variant.irregularForms} />
                      <small>{variant.constraints}</small>
                    </span>
                  </label>
                ))}
              </div>
            </article>
          ))}
          <div className="capture-review-actions">
          <button className="primary-button" disabled={phase === "approving"} onClick={() => void approve()} type="button">
              {phase === "approving" ? "保存中…" : phase === "done" ? "保存済み" : "選択した候補を保存"}
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
