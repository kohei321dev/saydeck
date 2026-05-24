# ADR 0002: Topic card data model

- Status: Proposed
- Date: 2026-05-24

## Context

同じ場面でも、学習者の状態によって使える英文の長さや複雑さが変わる。1つのトピックカードに対して、簡単な回答、少し詳しい回答、理由つきの回答、会話として自然な回答を並べたい。

## Decision

トピックカードは、1カードに複数の回答レベルを持たせる。初期データはCSVのlong formatで管理する。

1行は「カード1つ」ではなく「カード1つ + 回答レベル1つ」を表す。

主な列は以下。

- `card_id`
- `category`
- `scene_ja`
- `prompt_en`
- `prompt_ja`
- `level`
- `level_name`
- `constraints`
- `model_answer_en`
- `model_answer_ja`
- `review_points`
- `tags`

## Consequences

### Positive

- CSVで追加しやすい
- 同じカードに難易度別回答を増やせる
- アプリ側でlevelを切り替えやすい
- 最初はスプレッドシートでも編集できる

### Negative

- 1カードが複数行になるため、人間が読むと少し冗長になる
- 後でクイズ履歴や語彙リンクを持つ場合、JSONやDBへの移行が必要になる可能性がある

## Future Migration

カード数が増えたら、CSVをsource of truthにしたままbuild時にJSONへ変換する。AI生成・検索・履歴同期が必要になったら、SQLite、Supabase、Vercel Postgresなどを検討する。

