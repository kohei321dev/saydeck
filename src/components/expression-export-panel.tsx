"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { variantDisplayName } from "@/lib/generation-profiles";
import type { ExpressionEntryDetail } from "@/lib/expression-types";

const exportSelectionKey = "saydeck.export-selection.v2";

type Props = { entries: ExpressionEntryDetail[] };

export function ExpressionExportPanel({ entries }: Props) {
  const candidates = useMemo(() => entries.flatMap((entry) =>
    entry.sentenceCards.flatMap((card) =>
      (card.variants ?? [])
        .filter((variant) =>
          entry.status === "registered"
            && variant.isSelected
            && variant.status !== "archived",
        )
        .map((variant) => ({ entry, card, variant })),
    ),
  ), [entries]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(
      candidates
        .filter(({ variant }) => variant.isSelected)
        .map(({ variant }) => variant.id),
    ),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(exportSelectionKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as unknown;
      if (!Array.isArray(stored)) return;
      const candidateIds = new Set(candidates.map(({ variant }) => variant.id));
      const restored = stored.filter(
        (id): id is string => typeof id === "string" && candidateIds.has(id),
      );
      setSelectedIds(new Set(restored));
    } catch {
      // The persisted database selection remains when sessionStorage is unavailable.
    }
  }, [candidates]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      const payload = await response.json().catch(() => null) as {
        export?: { id?: string; cardCount?: number; filename?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.export?.id) {
        throw new Error(payload?.error?.message ?? "APKGを作成できませんでした。");
      }

      const downloadResponse = await fetch(
        `/api/anki-exports/${encodeURIComponent(payload.export.id)}/download`,
      );
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
      setStatus(`${payload.export.cardCount ?? variantIds.length}枚をAPKGにまとめました。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "APKGを作成できませんでした。");
    } finally {
      setIsExporting(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <section className="library-empty">
        <p className="eyebrow">EXPORT</p>
        <h2>保存済みの表現を選択してください</h2>
        <p>INPUTで表現を保存し、LISTSからAPKGに含めるカードを選択します。</p>
        <Link className="primary-button" href="/lists">LISTSへ進む</Link>
      </section>
    );
  }

  return (
    <section aria-label="APKG export" className="export-panel">
      <div className="export-actions">
        <span>{selectedIds.size}/{candidates.length}枚をAPKGへ含めます</span>
        <button
          className="primary-button"
          disabled={isExporting}
          onClick={() => void exportCards()}
          type="button"
        >
          {isExporting ? "音声とAPKGを作成中…" : "APKGを作成"}
        </button>
      </div>
      {status ? <p className="capture-notice" role="status">{status}</p> : null}
      <div className="export-card-list">
        {candidates.map(({ entry, card, variant }) => (
          <label className="export-card-row" key={variant.id}>
            <input
              checked={selectedIds.has(variant.id)}
              onChange={() => toggle(variant.id)}
              type="checkbox"
            />
            <span className="capture-variant-level">
              {variantDisplayName(variant.profileCode, variant.patternCode)}
            </span>
            <span>
              <strong lang="en">{variant.expressionEn}</strong>
              <small>{variant.translationJa}</small>
              <small className="export-context">
                {entry.primarySituation?.labelJa} › {entry.secondarySituation?.labelJa} ·{" "}
                {String(entry.situationSequence ?? 0).padStart(3, "0")}-
                {String(card.position + 1).padStart(2, "0")}
              </small>
            </span>
            <time dateTime={entry.registeredAt ?? entry.updatedAt}>
              {formatDate(entry.registeredAt ?? entry.updatedAt)}
            </time>
          </label>
        ))}
      </div>
      <p className="field-hint">
        SayDeckノートの5フィールド、主・副・表現レイヤーのdeck階層、表面で再生する
        en-US英文音声を1つのAPKGへ同梱します。裏面は日本語訳のみです。
      </p>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
