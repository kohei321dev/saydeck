import type { ExpressionEntryDetail } from "@/lib/expression-types";

type Props = {
  entries: ExpressionEntryDetail[];
};

export function ExpressionLibrary({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <section className="library-empty">
        <p className="eyebrow">LISTS</p>
        <h1>まだ表現がありません</h1>
        <p>INPUTで日本語から英文候補を作成すると、ここに表示されます。</p>
      </section>
    );
  }

  return (
    <section className="library-list" aria-label="保存済み表現">
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
          <p className="library-date">作成日: {formatDate(entry.createdAt)}</p>
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
                      <b>{variant.keyExpression}</b>
                      <span>{variant.definitionJa}</span>
                      <b>{variant.english}</b>
                      <span>{variant.japanese}</span>
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(value));
}
