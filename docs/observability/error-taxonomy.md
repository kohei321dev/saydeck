# Error Taxonomy

- Related Issue: #53
- Parent Issue: #50

## Purpose

SayDeckのAPI、UI、server logで同じエラー分類を使い、失敗原因とユーザーの次アクションを追いやすくする。

この文書は分類とresponse shapeを決める。各API routeへの適用は、後続PRで小さく進める。

## Response Shape

API error responseは次の形に寄せる。

```json
{
  "error": {
    "code": "external_ai_unavailable",
    "message": "英文候補の生成に失敗しました。少し時間を置いて再実行してください。",
    "action": "retry_later"
  }
}
```

`message` はUI表示用にする。secret、raw provider payload、DB接続文字列、stack trace、入力本文は含めない。

`action` は任意だが、UIで次の動きを出す場合に使う。

## Log Detail Shape

server logでは、UI messageとは別に調査用detailを残す。

```json
{
  "event": "api_error",
  "code": "external_ai_unavailable",
  "route": "/api/expressions/:id/generate",
  "status": 502,
  "provider": "owner_ai",
  "operation": "generate_expression_variants"
}
```

log detailにもsecret、raw request body、raw provider response、学習者の回答文、認証付きURLは含めない。

## Taxonomy

| Code | HTTP status | User message direction | Log detail examples |
|---|---:|---|---|
| `client_validation` | 400 / 413 | 入力内容を修正して再実行する | missing field, invalid shape, body too large |
| `auth_required` | 401 | ログインする | route, auth provider availability |
| `permission_denied` | 403 | 許可されたアカウントで実行する | role, required capability |
| `not_found` | 404 | 対象を選び直す、再読み込みする | resource type, sanitized id |
| `db_unavailable` | 503 / 502 | DB設定または時間を置いた再実行を促す | database not configured, migration missing, query failed |
| `external_ai_unavailable` | 502 / 503 | 時間を置いて再実行する | provider, operation, sanitized error name |
| `external_ai_quota_exceeded` | 429 / 503 | 利用量またはcredit設定の確認を促す | provider, quota category, retryable |
| `server_error` | 500 | 時間を置いて再実行する | route, operation, sanitized error name |
| `network_or_client_environment` | 0 / 408 / 499 | 通信環境、ブラウザ、拡張機能の確認を促す | client-side fetch failure category |

## Category Rules

### `client_validation`

request bodyの形式不正、必須項目不足、文字数超過など、ユーザー入力またはclient実装で修正できるもの。

### `auth_required`

sessionがない、OAuth providerが未設定でログイン導線を出せないなど、認証が前提のもの。

### `permission_denied`

ログイン済みだがowner権限がない、viewerに許可していない操作を実行したもの。

### `db_unavailable`

`DATABASE_URL` 未設定、migration未適用、DB query failureなど。ユーザー入力エラーではなく、保存・取得基盤の問題として扱う。

### `external_ai_unavailable`

AI providerへのrequest失敗、provider側の一時障害、response parse failureなど。quotaやcredit不足が判定できる場合は `external_ai_quota_exceeded` を優先する。

### `external_ai_quota_exceeded`

rate limit、credit不足、monthly budget超過など。provider responseの本文は保存せず、判定済みcategoryだけを残す。

### `server_error`

分類済みの原因に当てはまらないアプリケーション内部エラー。まずこの分類に落としてから、頻出するものは専用codeへ分ける。

### `network_or_client_environment`

client-side fetch failure、ブラウザ拡張、offline、timeoutなど、serverに到達していない可能性があるもの。server API responseとして返せない場合もあるため、UI側の表示分類として扱う。

## UI Message Rules

- ユーザーが次に取れる行動を1つ含める
- provider名は必要な場合だけ出す
- secret、token、raw payload、stack traceを出さない
- owner向け設定不足とviewer向け設定不足は、役割を分けて表現する
- retry可能か、設定確認が必要か、入力修正が必要かを分ける

## Implementation Checklist

- [ ] API routeのerror responseを `{ error: { code, message, action } }` へ寄せる
- [ ] UI表示は `message` を使い、log detailを表示しない
- [ ] server logは `code`、`route`、`status`、`operation` を含める
- [ ] external AI quota / rate limit は `external_ai_quota_exceeded` に寄せる
- [ ] DB未設定、migration未適用、query failureは `db_unavailable` に寄せる
- [ ] raw request body、answer、prompt、provider payloadをログやresponseに含めない

## References

- Issue #50: ログ設計とSLA/SLO・エラーバジェット基盤を設計する
- Issue #53: obs: UI・Vercel・DB・外部APIのエラー分類を設計する
