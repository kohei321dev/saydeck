# Log Redaction Policy

- Related Issue: #58
- Parent Issue: #50

## Purpose

SayDeckのログは、障害調査に必要な原因分類だけを残し、secret、個人情報、日本語入力や生成本文を保存しない。

## Log Fields

ログに出してよいもの:

- event名
- HTTP status
- API route名
- error name
- redaction済みのerror message
- secretを含まない設定状態
- card id、level、roleなど、本文を含まない短い識別子

ログに出してはいけないもの:

- API key、token、cookie、authorization header
- OAuth client secret、provider raw payload
- `DATABASE_URL` とDB接続文字列
- raw request body
- 日本語入力と生成対象の英文
- AI providerへのprompt全文
- AI providerのraw response全文
- private URL、secretを含むURL、認証付きURL

## Default Handling

server-sideの障害ログは `logServerError` を使う。`console.error(error)` でError objectを直接出力しない。

`logServerError` は以下を行う。

- `Error` は `name` とredaction済み `message` に縮約する
- sensitive keyを持つobject fieldを `[redacted]` に置き換える
- secretらしい文字列や認証付きURLを `[redacted]` に置き換える
- ネストの深さと配列長を制限する

## AI Generation Data

日本語入力、カード生成入力、AI prompt、AI response全文は通常ログに残さない。

debugのために本文が必要な場合も、まず再現用の最小入力を人間が作り、production user inputをそのまま保存しない。samplingやopt-inで詳細ログを追加する場合は、保存先、保持期間、削除方法を同じPRで決める。

## Checklist

- [ ] `console.error(error)` を直接追加していない
- [ ] request body、answer、scene text、prompt全文をログに入れていない
- [ ] `Authorization`、`Cookie`、`DATABASE_URL`、`*_KEY`、`*_SECRET` をログに入れていない
- [ ] provider error payloadをそのまま出していない
- [ ] DB接続文字列や認証付きURLを出していない
- [ ] secret値ではなく、設定有無やerror categoryだけを出している
