# Log Storage Policy

- Related Issue: #57
- Parent Issue: #50
- Date: 2026-06-19

## Purpose

SayDeckのapplication logを、Vercel / Neon / external AI providerに過度に依存しない形で扱う。

この文書は初期ログ保存先、短期retention、長期分析への拡張条件、provider-neutral log schemaを決める。実装は後続PRで小さく適用する。

## Decision

[判断] 初期ログ保存先はVercel Runtime Logsにする。

[判断] application logはJSON structured logとして標準出力へ出す。アプリケーション側はVercel固有fieldを前提にせず、後でLog Drainsや他cloud loggingへ流せるschemaに寄せる。

[判断] Neon/Postgresにはapplication logを保存しない。表現データ用DBと運用ログを混ぜると、DB負荷、retention、private data削除、検索用途が衝突するため。

[判断] 長期保存や横断分析が必要になったら、Vercel Log Drainsまたは外部observability serviceを追加する。その時点で保存先、保持期間、費用上限、削除方法を同じPRで決める。

## Storage Options

| Option | Role | Initial decision | Notes |
|---|---|---|---|
| Vercel Runtime Logs | 短期調査 | Use | deployment直後のAPI failure、runtime error、設定不足の確認に使う |
| Vercel Log Drains | 長期保存・外部分析 | Later | retentionを伸ばす必要が出た時に使う |
| Neon table | audit/event data | Do not use for application logs | 表現DBとログDBの責務が混ざるため避ける |
| External observability service | 検索・可視化・alert | Later | error rate、latency、quota分類を継続監視する段階で検討する |
| Future cloud provider logging | 移行先 | Keep compatible | schemaをprovider-neutralにして移行コストを下げる |

## Retention Policy

### Short Term

短期調査はVercel Runtime Logsで行う。

用途:

- deploy後のserver error確認
- `/api/expressions/:id/generate` のAI provider failure確認
- DB未設定、migration未適用、query failureの確認
- owner権限判定の失敗確認

### Long Term

次のいずれかが必要になった時点で長期保存を追加する。

- 週次・月次のerror trendを見る
- AI quota / credit不足を継続追跡する
- SLO / error budgetを数週間以上で評価する
- request idで過去incidentを検索する
- alertやdashboardを作る

長期保存先を追加するPRでは、保存期間、削除手順、費用上限、redaction testを必須にする。

## Provider-Neutral Schema

application logは次のfieldを基本形にする。

```json
{
  "event": "api_error",
  "timestamp": "2026-06-19T00:00:00.000Z",
  "level": "error",
  "service": "saydeck",
  "environment": "production",
  "route": "/api/expressions/:id/generate",
  "method": "POST",
  "status": 502,
  "requestId": "req_...",
  "operation": "generate_expression",
  "code": "external_ai_unavailable",
  "provider": "owner_ai",
  "role": "owner",
  "durationMs": 1200,
  "retryable": true
}
```

必須field:

- `event`
- `timestamp`
- `level`
- `service`
- `environment`
- `route`
- `operation`
- `code`

任意field:

- `method`
- `status`
- `requestId`
- `provider`
- `role`
- `durationMs`
- `retryable`
- `resource`
- `model`

## Application Log vs Audit Log

application log:

- API failure、DB failure、AI provider failure、latency、quota分類を扱う
- 原則として短期調査とSLO評価に使う
- user input本文やsecretを含めない

audit log:

- ownerによるカード作成、削除、設定変更など、後から「誰が何をしたか」を説明するeventを扱う
- application logとは保存先とretentionを分ける
- 初期scopeでは実装しない

## Redaction Rules

log storageに送る前に、次を保存しない。

- API key、token、cookie、authorization header
- OAuth client secret、provider raw payload
- `DATABASE_URL` とDB接続文字列
- raw request body
- 日本語入力と生成対象の英文
- AI prompt全文
- AI provider response全文
- private URL、secretを含むURL、認証付きURL

詳細は `docs/observability/redaction-policy.md` が存在する場合はそちらを優先する。未mergeの場合でも、この文書のredaction rulesを最低条件にする。

## Query Examples

長期保存先を導入した後に必要になる検索軸:

- `code = external_ai_quota_exceeded`
- `route = /api/expressions/:id/generate`
- `operation = generate_expression`
- `role = owner`
- `status >= 500`
- `durationMs > 3000`
- `requestId = <reported request id>`

## Revisit Conditions

- SLO / error budgetを運用し始める
- error trendを3日より長く追いたくなる
- AI quota / credit不足を継続監視する
- 複数ownerや共有操作のaudit要件が出る
- Vercel以外のhostingへ移行する
- 外部observability serviceの費用対効果を評価する

## References

- Issue #50: ログ設計とSLA/SLO・エラーバジェット基盤を設計する
- Issue #57: obs: ログ格納先・保持期間・provider-neutralなログ形式を設計する
- Vercel Logs: https://vercel.com/docs/logs
- Vercel Drains: https://vercel.com/docs/drains
