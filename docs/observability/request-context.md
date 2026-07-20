# Request Context and Correlation ID

- Related Issue: #52
- Parent Issue: #50
- Date: 2026-07-06

## Purpose

SayDeckのAPI requestを、server log、DB処理、external AI callの失敗調査で同じIDから追えるようにする。

この文書は最小実装として、request IDの生成・伝播ルールと代表APIへの試験導入範囲を定義する。

## Decision

[判断] API routeごとにrequest contextを作り、`requestId`、`route`、`method`、`operation`、`durationMs`をserver logへ渡す。

[判断] clientまたはupstreamが安全な `x-request-id` または `x-correlation-id` を送った場合はそれを採用する。未指定、空文字、不正な文字列の場合はserver側で `req_<uuid>` を生成する。

[判断] response headerには `x-request-id` と `x-correlation-id` の両方を同じ値で返す。UIや問い合わせではまず `x-request-id` を参照する。

[判断] 初期導入は `/api/expressions/:id/generate` に限定する。AI生成は外部provider、model設定、入力validationが絡むため、代表APIとしてrequest IDの効果を確認しやすい。

## Request ID Rules

- 許可するincoming IDは8〜128文字の英数字、`.`、`_`、`:`、`-` のみ
- 許可外のincoming IDはログに残さず破棄し、server生成IDに置き換える
- request body、日本語入力、AI prompt、provider raw responseはrequest contextに含めない
- request IDはsecretではないが、認証付きURLやprivate payloadとは結合して保存しない

## Initial Implementation

`src/lib/request-context.ts` を共通helperにする。

初期helperの責務:

- request headerから安全なincoming IDを取り出す
- server生成IDを作る
- `NextResponse` に `x-request-id` / `x-correlation-id` を付与する
- redaction済みserver logへ渡す基本fieldを作る

`/api/expressions/:id/generate` の初期ログfield:

- `event`
- `requestId`
- `route`
- `method`
- `operation`
- `durationMs`
- `status`
- `code`
- `provider`
- `role`
- `retryable`

## Next Rollout

次の順で広げる。

1. `/api/expressions` と `/api/expressions/:id`
2. `/api/anki-exports` とdownload route
3. DB helperとAI/TTS provider adapterの内部ログ
4. UI error displayで `x-request-id` を表示または保存する導線

DB queryやexternal AI callへ広げる場合も、raw request body、answer、prompt、provider payloadはログへ含めない。

## References

- Issue #50: ログ設計とSLA/SLO・エラーバジェット基盤を設計する
- Issue #52: obs: リクエスト相関IDでUIからDB・外部APIまで追跡する
- `docs/observability/error-taxonomy.md`
- `docs/observability/log-storage.md`
- `docs/observability/redaction-policy.md`
