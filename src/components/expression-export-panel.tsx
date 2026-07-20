"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ExpressionEntryDetail } from "@/lib/expression-types";

const exportSelectionKey = "saydeck.export-selection.v1";

type Props = { entries: ExpressionEntryDetail[] };

export function ExpressionExportPanel({ entries }: Props) {
  const candidates = useMemo(() => entries.flatMap((entry) => entry.sentenceCards.flatMap((card) =>
    (card.variants ?? []).filter((variant) => entry.status === "registered" && variant.status !== "archived").map((variant) => ({ entry, variant })),
  )), [entries]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(candidates.map(({ variant }) => variant.id)));
  const [status, setStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(exportSelectionKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as unknown;
      if (!Array.isArray(stored)) return;
      const candidateIds = new Set(candidates.map(({ variant }) => variant.id));
      const restored = stored.filter((id): id is string => typeof id === "string" && candidateIds.has(id));
      if (restored.length) setSelectedIds(new Set(restored));
    } catch {
      // The default selection remains available when sessionStorage cannot be read.
    }
  }, [candidates]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function exportCards() {
    const variantIds = Array.from(selectedIds);
    if (variantIds.length === 0) {
      setStatus("APKGに含める表現を1件以上選択してください。");
      return;
    }

    setIsExporting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/anki-exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIds }),
      });
      const payload = await response.json().catch(() => null) as { export?: { id?: string; cardCount?: number; filename?: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.export?.id) {
        throw new Error(payload?.error?.message ?? "APKGを作成できませんでした。");
      }

      const downloadResponse = await fetch(`/api/anki-exports/${encodeURIComponent(payload.export.id)}/download`);
      if (!downloadResponse.ok) {
        throw new Error("APKGをダウンロードできませんでした。");
      }
      const blob = await downloadResponse.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.export.filename ?? "saydeck-anki.apkg";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`${payload.export.cardCount ?? variantIds.length}件をAPKGにまとめました。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "APKGを作成できませんでした。");
    } finally {
      setIsExporting(false);
    }
  }

  if (candidates.length === 0) {
    return <section className="library-empty">
      <p className="eyebrow">EXPORT</p>
      <h2>保存済みの表現を選択してください</h2>
      <p>INPUTで表現を保存し、LISTSからAPKGに含める候補を選択します。</p>
      <Link className="primary-button" href="/lists">LISTSへ進む</Link>
    </section>;
  }

  return (
    <section aria-label="APKG export" className="export-panel">
      <div className="export-actions">
        <span>{selectedIds.size}/{candidates.length}件をAPKGへ含めます</span>
        <button className="primary-button" disabled={isExporting} onClick={() => void exportCards()} type="button">
          {isExporting ? "APKGを作成中…" : "APKGを作成"}
        </button>
      </div>
      {status ? <p className="capture-notice" role="status">{status}</p> : null}
      <div className="export-card-list">
        {candidates.map(({ entry, variant }) => (
          <label className="export-card-row" key={variant.id}>
            <input checked={selectedIds.has(variant.id)} onChange={() => toggle(variant.id)} type="checkbox" />
            <span className="capture-variant-level">{variant.profileCode}</span>
            <span><strong>{variant.keyExpression}</strong><small>{variant.english}</small></span>
            <time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time>
          </label>
        ))}
      </div>
      <p className="field-hint">Anki packageには、固定8フィールド、タグ、米国英語のWord・Example Sentence音声を同梱します。</p>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
