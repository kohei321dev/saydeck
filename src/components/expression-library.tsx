"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ExpressionEntryDetail } from "@/lib/expression-types";

const exportSelectionKey = "saydeck.export-selection.v1";

type Props = {
  entries: ExpressionEntryDetail[];
};

export function ExpressionLibrary({ entries: initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [keyword, setKeyword] = useState("");
  const [genre, setGenre] = useState("");
  const [tag, setTag] = useState("");
  const [level, setLevel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialEntries.flatMap((entry) => entry.sentenceCards.flatMap((card) =>
      (card.variants ?? []).filter((variant) => variant.isSelected).map((variant) => variant.id),
    ))),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(exportSelectionKey, JSON.stringify(Array.from(selectedIds)));
    } catch {
      // Selection remains usable in this view when sessionStorage is unavailable.
    }
  }, [selectedIds]);

  const genres = useMemo(() => Array.from(new Set(entries.map((entry) => entry.genreSlug).filter(Boolean))).sort(), [entries]);
  const tags = useMemo(() => Array.from(new Set(entries.flatMap((entry) => entry.situationTags))).sort(), [entries]);
  const visible = useMemo(() => entries.filter((entry) => {
    const text = [entry.inputJa, entry.genreSlug, ...entry.situationTags]
      .join(" ").toLowerCase();
    const updated = entry.updatedAt.slice(0, 10);
    const hasLevel = !level || entry.sentenceCards.some((card) =>
      (card.variants ?? []).some((variant) => variant.profileCode === level),
    );
    return (!keyword || text.includes(keyword.trim().toLowerCase()))
      && (!genre || entry.genreSlug === genre)
      && (!tag || entry.situationTags.includes(tag))
      && hasLevel
      && (!from || updated >= from)
      && (!to || updated <= to);
  }), [entries, from, genre, keyword, level, tag, to]);

  const visibleVariantIds = visible.flatMap((entry) => entry.sentenceCards.flatMap((card) =>
    (card.variants ?? []).filter((variant) => !level || variant.profileCode === level).map((variant) => variant.id),
  ));

  function toggleVariant(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectVisible(value: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of visibleVariantIds) {
        if (value) next.add(id); else next.delete(id);
      }
      return next;
    });
  }

  function updateEntry(entryId: string, update: (entry: ExpressionEntryDetail) => ExpressionEntryDetail) {
    setEntries((current) => current.map((entry) => entry.id === entryId ? update(entry) : entry));
  }

  async function saveEntry(entry: ExpressionEntryDetail) {
    const entryVariantIds = entry.sentenceCards.flatMap((card) => (card.variants ?? []).map((variant) => variant.id));
    const selectedForEntry = entryVariantIds.filter((id) => selectedIds.has(id));
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
      });
      const payload = await response.json().catch(() => null) as { entry?: ExpressionEntryDetail; error?: { message?: string } } | null;
      if (!response.ok || !payload?.entry) {
        throw new Error(payload?.error?.message ?? "表現を保存できませんでした。");
      }
      updateEntry(entry.id, () => payload.entry!);
      setNotice("編集内容と選択状態を保存しました。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "表現を保存できませんでした。");
    } finally {
      setSavingId(null);
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
        <label className="capture-field"><span>キーワード</span><input onChange={(event) => setKeyword(event.target.value)} value={keyword} /></label>
        <label className="capture-field"><span>ジャンル</span><select onChange={(event) => setGenre(event.target.value)} value={genre}><option value="">すべて</option>{genres.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="capture-field"><span>シチュエーション</span><select onChange={(event) => setTag(event.target.value)} value={tag}><option value="">すべて</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="capture-field"><span>レベル</span><select onChange={(event) => setLevel(event.target.value)} value={level}><option value="">すべて</option>{["L1", "L2", "L3", "L4"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="capture-field"><span>更新日以降</span><input onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label>
        <label className="capture-field"><span>更新日まで</span><input onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>
      </div>
      <div className="lists-selection-bar">
        <span>{visible.length}件表示 / {selectedIds.size}件選択</span>
        <button className="secondary-button" onClick={() => selectVisible(true)} type="button">表示中を選択</button>
        <button className="secondary-button" onClick={() => selectVisible(false)} type="button">表示中を解除</button>
        <Link className="primary-button" href="/export">選択してEXPORTへ</Link>
      </div>
      {notice ? <p className="capture-notice" role="status">{notice}</p> : null}
      {visible.map((entry) => (
        <article className="library-entry" key={entry.id}>
          <div className="library-entry-heading">
            <div>
              <p className="eyebrow">{entry.genreSlug || "expression"}</p>
              <h2>{entry.inputJa}</h2>
              <p>{entry.situationTags.join(" / ")}</p>
            </div>
            <time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time>
          </div>
          <div className="capture-ai-metadata">
            <label className="capture-inline-editor"><span>ジャンル</span><select onChange={(event) => updateEntry(entry.id, (current) => ({ ...current, genreSlug: selectedGenre(event.target.value, current.genreSlug) }))} value={genreMode(entry.genreSlug)}><option value="">指定なし（AIに任せる）</option><option value="daily">日常生活</option><option value="skateboarding">スケートボード</option><option value="other">その他</option></select>{genreMode(entry.genreSlug) === "other" ? <input maxLength={120} onChange={(event) => updateEntry(entry.id, (current) => ({ ...current, genreSlug: event.target.value }))} value={entry.genreSlug} /> : null}</label>
            <p className="field-hint">シチュエーションタグ: {entry.situationTags.join(" / ")}</p>
          </div>
          {entry.sentenceCards.map((card) => (
            <div className="library-card" key={card.id}>
              <strong>{card.intentJa}</strong>
              {(card.variants ?? []).filter((variant) => !level || variant.profileCode === level).map((variant) => (
                <label className="library-variant" key={variant.id}>
                  <input checked={selectedIds.has(variant.id)} onChange={() => toggleVariant(variant.id)} type="checkbox" />
                  <span className="capture-variant-level">{variant.profileCode}</span>
                  <span className="capture-variant-copy">
                    <input aria-label={`${variant.profileCode} 英文`} className="capture-inline-input" onChange={(event) => updateEntry(entry.id, (current) => updateVariant(current, variant.id, "english", event.target.value))} value={variant.english} />
                    <input aria-label={`${variant.profileCode} 和訳`} className="capture-inline-input" onChange={(event) => updateEntry(entry.id, (current) => updateVariant(current, variant.id, "japanese", event.target.value))} value={variant.japanese} />
                    <input aria-label={`${variant.profileCode} Word`} className="capture-inline-input" onChange={(event) => updateEntry(entry.id, (current) => updateVariant(current, variant.id, "keyExpression", event.target.value))} value={variant.keyExpression} />
                    <input aria-label={`${variant.profileCode} Definition`} className="capture-inline-input" onChange={(event) => updateEntry(entry.id, (current) => updateVariant(current, variant.id, "definitionJa", event.target.value))} value={variant.definitionJa} />
                    <input aria-label={`${variant.profileCode} Irregular Forms`} className="capture-inline-input" onChange={(event) => updateEntry(entry.id, (current) => updateVariant(current, variant.id, "irregularForms", event.target.value))} value={variant.irregularForms} />
                  </span>
                </label>
              ))}
            </div>
          ))}
          <button className="secondary-button" disabled={savingId === entry.id} onClick={() => void saveEntry(entry)} type="button">
            {savingId === entry.id ? "保存中…" : "この表現を保存"}
          </button>
        </article>
      ))}
    </section>
  );
}

function updateVariant(
  entry: ExpressionEntryDetail,
  variantId: string,
  field: "english" | "japanese" | "keyExpression" | "definitionJa" | "irregularForms",
  value: string,
): ExpressionEntryDetail {
  return {
    ...entry,
    sentenceCards: entry.sentenceCards.map((card) => ({
      ...card,
      variants: (card.variants ?? []).map((variant) => variant.id === variantId ? { ...variant, [field]: value } : variant),
    })),
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(value));
}

function genreMode(value: string): "" | "daily" | "skateboarding" | "other" {
  if (value === "daily" || value === "skateboarding") return value;
  return value ? "other" : "";
}

function selectedGenre(mode: string, currentValue: string): string {
  if (mode === "daily" || mode === "skateboarding") return mode;
  if (mode === "other") return genreMode(currentValue) === "other" ? currentValue : "";
  return "";
}
