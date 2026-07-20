"use client";

import type { AudioAssetKind, ExpressionEntryDetail, SentenceVariant } from "@/lib/expression-types";
import { SpeechButton } from "@/components/speech-button";
import { AudioRegisterButton } from "@/components/audio-register-button";

type Props = {
  entries: ExpressionEntryDetail[];
};

export function ExpressionLibrary({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <section className="library-empty">
        <p className="eyebrow">LIBRARY</p>
        <h1>まだカードがありません</h1>
        <p>思いついた日本語を保存すると、ここに英文候補と登録状態が表示されます。</p>
      </section>
    );
  }

  return (
    <section className="library-list" aria-label="登録済み表現">
      {entries.map((entry) => (
        <article className="library-entry" key={entry.id}>
          <div className="library-entry-heading">
            <div>
              <p className="eyebrow">{entry.genreSlug || "expression"}</p>
              <h2>{entry.inputJa}</h2>
              {entry.situationJa ? <p>{entry.situationJa}</p> : null}
            </div>
            <span className={`library-status status-${entry.status}`}>{entry.status}</span>
          </div>
          <p className="library-date">登録日: {formatDate(entry.registeredAt ?? entry.updatedAt)}</p>
          <div className="library-tags">
            {entry.situationTags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="library-cards">
            {entry.sentenceCards.map((card) => (
              <div className="library-card" key={card.id}>
                <strong>{card.intentJa}</strong>
                {(card.variants ?? []).filter((variant) => variant.isSelected || entry.status !== "registered").map((variant) => (
                  <div className="library-variant" key={variant.id}>
                    <span className="capture-variant-level">{variant.profileCode}</span>
                    <div>
                      <b>{variant.english}</b>
                      <span>{variant.japanese}</span>
                    </div>
                    <div className="library-variant-actions">
                      <SpeechButton label="例文" text={variant.english} audioUrl={audioUrl(variant, "sentence")} />
                      <SpeechButton label="語句" text={variant.keyExpression} audioUrl={audioUrl(variant, "word")} />
                      <small>{audioStatus(variant)}</small>
                      {audioStatus(variant) !== "WAV音声登録済み" ? <AudioRegisterButton variantId={variant.id} /> : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function audioUrl(variant: SentenceVariant, kind: AudioAssetKind): string | undefined {
  const asset = variant.audioAssets?.find((item) => item.kind === kind && item.status === "ready" && item.provider !== "browser-speech");
  return asset ? `/api/audio/${encodeURIComponent(asset.id)}` : undefined;
}

function audioStatus(variant: {
  status: string;
  audioAssets?: Array<{ id: string; kind: string; status: string; provider: string }>;
}): string {
  const assets = variant.audioAssets ?? [];
  const providerReady = ["word", "sentence"].every((kind) => assets.some((asset) =>
    asset.kind === kind && asset.status === "ready" && asset.provider !== "browser-speech",
  ));
  if (providerReady) return "WAV音声登録済み";
  if (assets.some((asset) => asset.provider === "browser-speech")) return "ブラウザ音声（DEV）";
  return variant.status;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(value));
}
