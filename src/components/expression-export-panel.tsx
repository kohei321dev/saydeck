"use client";

import { useMemo, useState } from "react";

import type { ExpressionEntryDetail, SentenceVariant } from "@/lib/expression-types";

type Props = { entries: ExpressionEntryDetail[] };

export function ExpressionExportPanel({ entries }: Props) {
  const allSelected = useMemo(
    () => entries.flatMap((entry) => entry.sentenceCards.flatMap((card) => (card.variants ?? [])
      .filter((variant) => variant.isSelected && variant.status !== "archived")
      .map((variant) => ({ entry, card, variant })))),
    [entries],
  );
  const apkgCandidates = useMemo(
    () => allSelected.filter(({ variant }) => isProviderAudioReady(variant)),
    [allSelected],
  );
  const apkgCandidateIds = useMemo(
    () => new Set(apkgCandidates.map(({ variant }) => variant.id)),
    [apkgCandidates],
  );
  const tags = useMemo(
    () => Array.from(new Set(entries.flatMap((entry) => entry.situationTags))).sort(),
    [entries],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(allSelected.map(({ variant }) => variant.id)),
  );
  const [tag, setTag] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const visible = tag
    ? allSelected.filter(({ entry }) => entry.situationTags.includes(tag))
    : allSelected;

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectVisible(value: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const { variant } of visible) {
        if (value) next.add(variant.id); else next.delete(variant.id);
      }
      return next;
    });
  }

  async function exportCards() {
    const exportIds = Array.from(selectedIds).filter((id) => apkgCandidateIds.has(id));

    if (exportIds.length === 0) {
      setStatus("APKGに必要なWordとExample Sentenceの音声が揃った表現を選択してください。");
      return;
    }
    setIsExporting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/anki-exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantIds: exportIds,
          tags: tag ? [tag] : [],
          from: from || undefined,
          to: to ? `${to}T23:59:59.999Z` : undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "エクスポートに失敗しました。");
      }
      const payload = await response.json() as { export?: { id?: string; cardCount?: number; filename?: string } };
      if (!payload.export?.id) {
        throw new Error("APKGのダウンロード情報を取得できませんでした。");
      }
      const downloadResponse = await fetch(`/api/anki-exports/${encodeURIComponent(payload.export.id)}/download`);
      if (!downloadResponse.ok) {
        const downloadError = await downloadResponse.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(downloadError.error?.message ?? "ダウンロードに失敗しました。");
      }
      const blob = await downloadResponse.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.export?.filename ?? "saydeck-anki.apkg";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`${payload.export?.cardCount ?? exportIds.length}件をAPKGへ出力しました。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "エクスポートに失敗しました。");
    } finally {
      setIsExporting(false);
    }
  }

  if (allSelected.length === 0) {
    return <div className="done-note">
      登録済みで選択されたAnkiカードがありません。
    </div>;
  }

  return (
    <section className="export-panel" aria-label="Anki export">
      <div className="export-toolbar">
        <label className="capture-field">
          <span>タグで絞り込む</span>
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="">すべてのタグ</option>
            {tags.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="capture-field"><span>登録日以降</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="capture-field"><span>登録日まで</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
      <div className="export-actions">
        <span>{selectedIds.size}/{allSelected.length}件選択</span>
        <button className="secondary-button" onClick={() => selectVisible(true)} type="button">表示中を選択</button>
        <button className="secondary-button" onClick={() => selectVisible(false)} type="button">表示中を解除</button>
        <button className="primary-button" disabled={isExporting} onClick={() => void exportCards()} type="button">
          {isExporting ? "作成中…" : `APKGを作成（準備済み ${Array.from(selectedIds).filter((id) => apkgCandidateIds.has(id)).length}件）`}
        </button>
      </div>
      {apkgCandidates.length === 0 ? (
        <p className="capture-notice">現在、APKGに必要な英語音声が準備済みの表現はありません。</p>
      ) : null}
      {status ? <p className="capture-notice" role="status">{status}</p> : null}
      <div className="export-card-list">
        {visible.map(({ entry, variant }) => (
          <label className="export-card-row" key={variant.id}>
            <input checked={selectedIds.has(variant.id)} onChange={() => toggle(variant.id)} type="checkbox" />
            <span className="capture-variant-level">{variant.profileCode}</span>
            <span><strong>{variant.keyExpression}</strong><small>{variant.english}</small></span>
            <small>{apkgCandidateIds.has(variant.id) ? "APKG準備済み" : "音声未準備"}</small>
            <time dateTime={entry.registeredAt ?? entry.updatedAt}>{formatDate(entry.registeredAt ?? entry.updatedAt)}</time>
          </label>
        ))}
      </div>
      <p className="field-hint">APKGにはIndex / Word / Definition / Irregular Forms / Example Sentence / Translation / word_audio / sentence_audio、deck、タグ、英語音声を同梱します。</p>
    </section>
  );
}

function isProviderAudioReady(variant: SentenceVariant): boolean {
  if (variant.status !== "audio_ready") return false;
  const assets = variant.audioAssets ?? [];
  return ["word", "sentence"].every((kind) => assets.some((asset) =>
    asset.kind === kind
      && asset.status === "ready"
      && asset.provider !== "browser-speech"
      && Boolean(asset.blobPath)
      && !asset.blobPath.startsWith("browser-speech://"),
  ));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
