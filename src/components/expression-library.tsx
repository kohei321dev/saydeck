"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { profileDisplayName, profileDisplayOrder, variantDisplayName } from "@/lib/generation-profiles";
import type {
  ExpressionEntryDetail,
} from "@/lib/expression-types";

const exportSelectionKey = "saydeck.export-selection.v2";

type Props = {
  entries: ExpressionEntryDetail[];
};

export function ExpressionLibrary({ entries: initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [keyword, setKeyword] = useState("");
  const [primarySituationId, setPrimarySituationId] = useState("");
  const [secondarySituationId, setSecondarySituationId] = useState("");
  const [layer, setLayer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialEntries.flatMap((entry) =>
      entry.sentenceCards.flatMap((card) =>
        (card.variants ?? [])
          .filter((variant) => variant.isSelected)
          .map((variant) => variant.id),
      ),
    )),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginal, setEditingOriginal] = useState<ExpressionEntryDetail | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        exportSelectionKey,
        JSON.stringify(Array.from(selectedIds)),
      );
    } catch {
      // Selection remains usable in this view when sessionStorage is unavailable.
    }
  }, [selectedIds]);

  const primarySituations = useMemo(
    () => uniqueSituations(entries, "primary"),
    [entries],
  );
  const secondarySituations = useMemo(
    () => uniqueSituations(
      entries.filter(
        (entry) => !primarySituationId
          || entry.primarySituation?.id === primarySituationId,
      ),
      "secondary",
    ),
    [entries, primarySituationId],
  );
  const visible = useMemo(() => entries.filter((entry) => {
    const variantText = entry.sentenceCards.flatMap((card) =>
      (card.variants ?? [])
        .filter((variant) => variant.isSelected)
        .flatMap((variant) => [
          variant.expressionEn,
          variant.translationJa,
        ]),
    );
    const text = [
      entry.inputJa,
      entry.primarySituation?.labelJa ?? "",
      entry.secondarySituation?.labelJa ?? "",
      ...variantText,
    ].join(" ").toLowerCase();
    const registered = (entry.registeredAt ?? entry.updatedAt).slice(0, 10);
    const hasLayer = !layer || entry.sentenceCards.some((card) =>
      (card.variants ?? []).some(
        (variant) => variant.isSelected && variant.profileCode === layer,
      ),
    );
    return (!keyword || text.includes(keyword.trim().toLowerCase()))
      && (!primarySituationId || entry.primarySituation?.id === primarySituationId)
      && (!secondarySituationId || entry.secondarySituation?.id === secondarySituationId)
      && hasLayer
      && (!from || registered >= from)
      && (!to || registered <= to);
  }), [
    entries,
    from,
    keyword,
    layer,
    primarySituationId,
    secondarySituationId,
    to,
  ]);

  const visibleVariantIds = visible.flatMap((entry) =>
    entry.sentenceCards.flatMap((card) =>
      (card.variants ?? [])
        .filter((variant) =>
          variant.isSelected && (!layer || variant.profileCode === layer),
        )
        .map((variant) => variant.id),
    ),
  );

  function toggleVariant(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible(value: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of visibleVariantIds) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function updateEntry(
    entryId: string,
    update: (entry: ExpressionEntryDetail) => ExpressionEntryDetail,
  ) {
    setEntries((current) =>
      current.map((entry) => entry.id === entryId ? update(entry) : entry),
    );
  }

  async function saveEntry(entry: ExpressionEntryDetail) {
    const selectedForEntry = entry.sentenceCards.flatMap((card) =>
      (card.variants ?? [])
        .filter((variant) => variant.isSelected)
        .map((variant) => variant.id),
    );
    if (selectedForEntry.length === 0) {
      setNotice("保存する表現を1件以上選択してください。");
      return;
    }

    setSavingId(entry.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/expressions/${encodeURIComponent(entry.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedVariantIds: selectedForEntry,
          variants: entry.sentenceCards.flatMap((card) =>
            (card.variants ?? []).map((variant) => ({
              id: variant.id,
              expressionEn: variant.expressionEn,
              translationJa: variant.translationJa,
            })),
          ),
        }),
      });
      const payload = await response.json().catch(() => null) as {
        entry?: ExpressionEntryDetail;
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.entry) {
        throw new Error(payload?.error?.message ?? "表現を保存できませんでした。");
      }
      updateEntry(entry.id, () => payload.entry!);
      setNotice("英文・和訳と選択状態を保存しました。音声は次回EXPORT時に更新されます。");
      setEditingId(null);
      setEditingOriginal(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "表現を保存できませんでした。");
    } finally {
      setSavingId(null);
    }
  }

  function beginEditing(entry: ExpressionEntryDetail) {
    setEditingId(entry.id);
    setEditingOriginal(entry);
    setNotice(null);
  }

  function cancelEditing() {
    if (editingOriginal) {
      updateEntry(editingOriginal.id, () => editingOriginal);
    }
    setEditingId(null);
    setEditingOriginal(null);
  }

  async function archiveEntry(entry: ExpressionEntryDetail) {
    if (!window.confirm(`「${entry.inputJa}」を一覧から削除しますか？`)) return;

    setDeletingId(entry.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/expressions/${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "表現を削除できませんでした。");
      }

      const removedIds = new Set(entry.sentenceCards.flatMap((card) =>
        (card.variants ?? []).map((variant) => variant.id),
      ));
      setEntries((current) =>
        current.filter((currentEntry) => currentEntry.id !== entry.id),
      );
      setSelectedIds((current) =>
        new Set(Array.from(current).filter((id) => !removedIds.has(id))),
      );
      if (editingId === entry.id) {
        setEditingId(null);
        setEditingOriginal(null);
      }
      setNotice("表現を一覧から削除しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "表現を削除できませんでした。");
    } finally {
      setDeletingId(null);
    }
  }

  if (entries.length === 0) {
    return (
      <section className="library-empty">
        <p className="eyebrow">LISTS</p>
        <h1>まだ表現がありません</h1>
        <p>INPUTで保存した英語表現を、ここから選択してEXPORTへ渡します。</p>
        <Link className="primary-button" href="/input">INPUTへ進む</Link>
      </section>
    );
  }

  return (
    <section aria-label="保存済み表現" className="library-list">
      <div className="lists-filters">
        <label className="capture-field">
          <span>キーワード</span>
          <input
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="日本語・英語・シチュエーション"
            value={keyword}
          />
        </label>
        <label className="capture-field">
          <span>主シチュエーション</span>
          <select
            onChange={(event) => {
              setPrimarySituationId(event.target.value);
              setSecondarySituationId("");
            }}
            value={primarySituationId}
          >
            <option value="">すべて</option>
            {primarySituations.map((situation) => (
              <option key={situation.id} value={situation.id}>
                {situation.labelJa}
              </option>
            ))}
          </select>
        </label>
        <label className="capture-field">
          <span>副シチュエーション</span>
          <select
            onChange={(event) => setSecondarySituationId(event.target.value)}
            value={secondarySituationId}
          >
            <option value="">すべて</option>
            {secondarySituations.map((situation) => (
              <option key={situation.id} value={situation.id}>
                {situation.labelJa}
              </option>
            ))}
          </select>
        </label>
        <label className="capture-field">
          <span>表現レイヤー</span>
          <select onChange={(event) => setLayer(event.target.value)} value={layer}>
            <option value="">すべて</option>
            {profileDisplayOrder.map((code) => (
              <option key={code} value={code}>{profileDisplayName(code)}</option>
            ))}
          </select>
        </label>
        <label className="capture-field">
          <span>登録日以降</span>
          <input onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
        </label>
        <label className="capture-field">
          <span>登録日まで</span>
          <input onChange={(event) => setTo(event.target.value)} type="date" value={to} />
        </label>
      </div>
      <div className="lists-selection-bar">
        <span>{visible.length}件表示 / {selectedIds.size}枚選択</span>
        <button className="secondary-button" onClick={() => selectVisible(true)} type="button">
          表示中を選択
        </button>
        <button className="secondary-button" onClick={() => selectVisible(false)} type="button">
          表示中を解除
        </button>
        <Link className="primary-button" href="/export">選択してEXPORTへ</Link>
      </div>
      {notice ? <p className="capture-notice" role="status">{notice}</p> : null}
      {visible.map((entry) => (
        <article className="library-entry" key={entry.id}>
          <div className="library-entry-heading">
            <div>
              <p className="eyebrow">
                {String(entry.situationSequence ?? 0).padStart(3, "0")}
              </p>
              <h2>{entry.inputJa}</h2>
              <p className="library-situation-path">
                <strong>{entry.primarySituation?.labelJa ?? "主未設定"}</strong>
                <span aria-hidden="true">›</span>
                <strong>{entry.secondarySituation?.labelJa ?? "副未設定"}</strong>
              </p>
            </div>
            <div className="library-entry-meta">
              <time dateTime={entry.registeredAt ?? entry.updatedAt}>
                {formatDate(entry.registeredAt ?? entry.updatedAt)}
              </time>
              <div className="library-entry-actions">
                <button
                  className="secondary-button"
                  disabled={deletingId === entry.id || savingId === entry.id}
                  onClick={() =>
                    editingId === entry.id ? cancelEditing() : beginEditing(entry)}
                  type="button"
                >
                  {editingId === entry.id ? "編集をやめる" : "編集"}
                </button>
                <button
                  className="danger-button"
                  disabled={deletingId === entry.id || savingId === entry.id}
                  onClick={() => void archiveEntry(entry)}
                  type="button"
                >
                  {deletingId === entry.id ? "削除中…" : "削除"}
                </button>
              </div>
            </div>
          </div>

          <div className="library-cards">
            {entry.sentenceCards.map((card) => (
              <section className="library-card" key={card.id}>
                <div className="library-card-heading">
                  <span>
                    {String(entry.situationSequence ?? 0).padStart(3, "0")}-
                    {String(card.position + 1).padStart(2, "0")}
                  </span>
                  <strong>{card.intentJa}</strong>
                  <small className="library-generation-source">
                    {card.generationProvider === "sakana" ? "Sakana AI" : "xAI"} · {card.generationModel}
                  </small>
                </div>
                {(card.variants ?? [])
                  .filter((variant) =>
                    variant.isSelected && (!layer || variant.profileCode === layer),
                  )
                  .map((variant) => (
                    <div
                      className={
                        selectedIds.has(variant.id)
                          ? "library-variant selected"
                          : "library-variant"
                      }
                      key={variant.id}
                    >
                      <input
                        aria-label={`${variantDisplayName(variant.profileCode, variant.patternCode)}をEXPORT対象にする`}
                        checked={selectedIds.has(variant.id)}
                        onChange={() => toggleVariant(variant.id)}
                        type="checkbox"
                      />
                      <span className="capture-variant-level">
                        {variantDisplayName(variant.profileCode, variant.patternCode)}
                      </span>
                      {editingId === entry.id ? (
                        <div className="capture-variant-copy">
                          <label className="library-edit-field">
                            <span>英文</span>
                            <textarea
                              aria-label={`${variantDisplayName(variant.profileCode, variant.patternCode)} 英文`}
                              className="capture-inline-input"
                              onChange={(event) =>
                                updateEntry(entry.id, (current) =>
                                  updateVariant(
                                    current,
                                    variant.id,
                                    "expressionEn",
                                    event.target.value,
                                  ),
                                )}
                              rows={2}
                              value={variant.expressionEn}
                            />
                          </label>
                          <label className="library-edit-field">
                            <span>和訳</span>
                            <textarea
                              aria-label={`${variantDisplayName(variant.profileCode, variant.patternCode)} 和訳`}
                              className="capture-inline-input"
                              onChange={(event) =>
                                updateEntry(entry.id, (current) =>
                                  updateVariant(
                                    current,
                                    variant.id,
                                    "translationJa",
                                    event.target.value,
                                  ),
                                )}
                              rows={2}
                              value={variant.translationJa}
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="capture-variant-copy">
                          <strong lang="en">{variant.expressionEn}</strong>
                          <span>{variant.translationJa}</span>
                          <small className="library-anki-index">{variant.ankiIndex}</small>
                        </div>
                      )}
                    </div>
                  ))}
              </section>
            ))}
          </div>
          {editingId === entry.id ? (
            <div className="library-edit-actions">
              <button
                className="primary-button"
                disabled={savingId === entry.id}
                onClick={() => void saveEntry(entry)}
                type="button"
              >
                {savingId === entry.id ? "保存中…" : "編集を保存"}
              </button>
              <button
                className="secondary-button"
                disabled={savingId === entry.id}
                onClick={cancelEditing}
                type="button"
              >
                キャンセル
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function updateVariant(
  entry: ExpressionEntryDetail,
  variantId: string,
  field: "expressionEn" | "translationJa",
  value: string,
): ExpressionEntryDetail {
  return {
    ...entry,
    sentenceCards: entry.sentenceCards.map((card) => ({
      ...card,
      variants: (card.variants ?? []).map((variant) =>
        variant.id === variantId ? { ...variant, [field]: value } : variant,
      ),
    })),
  };
}

function uniqueSituations(
  entries: ExpressionEntryDetail[],
  kind: "primary" | "secondary",
) {
  const situations = new Map<string, NonNullable<ExpressionEntryDetail["primarySituation"]>>();
  for (const entry of entries) {
    const situation = kind === "primary"
      ? entry.primarySituation
      : entry.secondarySituation;
    if (situation) situations.set(situation.id, situation);
  }
  return Array.from(situations.values()).sort((left, right) =>
    left.labelJa.localeCompare(right.labelJa, "ja"),
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
