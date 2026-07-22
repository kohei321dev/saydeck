# SLO and Error Budget Policy

- Related Issue: #51
- Parent Issue: #50
- Date: 2026-06-21

## Purpose

SayDeckの初期SLO、失敗分類、error budgetの扱いを定義する。

この文書は個人利用段階の最小運用を対象にする。外部observability serviceや長期dashboardは、継続監視が必要になった時点で別issueで扱う。

## Scope

初期SLOの対象:

- INPUT / LISTS / EXPORT画面表示
- `/api/expressions/:id/generate` のAI表現生成
- `/api/expressions` と `/api/anki-exports` のDB read/write
- owner権限判定

対象外:

- 外部providerのSLA保証
- multi-region冗長化
- paid customer向けSLA
- 長期ログ保存先やalert dashboardの実装

## Initial SLOs

| Target | Success definition | Initial objective | Log fields |
|---|---|---:|---|
| Core pages | INPUT / LISTS / EXPORTが認証判定後に画面または明示的なsignin/setup状態を返す | 99% weekly | route, status, code, durationMs |
| AI generation | `/api/expressions/:id/generate` が成功、または分類済みエラーを返す | 95% weekly | route, operation, provider, role, model, code, durationMs |
| Expression and export persistence | DB利用時のread/writeが成功、または分類済みDBエラーを返す | 99% weekly | route, operation, resource, code, durationMs |
| Authorization | owner / non-owner / unauthenticatedを期待どおり判定する | 99.5% weekly | route, role, code, status |

初期objectiveは運用判断用の目安であり、外部向けSLAではない。

## Error Budget Rules

error budgetは週次で見る。

- `99% weekly` は、週の対象requestのうち1%までを許容失敗として扱う
- `95% weekly` は、AI provider依存を含むため初期は5%までを許容失敗として扱う
- request数が少ない週は割合だけで判断しない
- 同じ原因の失敗が2回以上続く場合は、割合に関係なく調査対象にする

個人利用段階では、error budget超過時に自動リリース停止はしない。代わりに、次の順で対応する。

1. `docs/observability/error-taxonomy.md` のcodeへ分類する
2. 再現route、role、provider、durationを確認する
3. secretやraw payloadを含まない形でissueへ記録する
4. 影響範囲がowner機能かviewer機能かを分ける

## Dependency Handling

Vercel、Neon、AI providerの失敗は、アプリケーションの欠陥と外部依存の失敗を分けて扱う。

| Failure source | SLO treatment | Error code direction |
|---|---|---|
| App validation or authorization bug | App SLO failure | `client_validation`, `permission_denied`, `server_error` |
| DB unavailable or migration missing | App-visible persistence failure | `db_unavailable` |
| AI provider unavailable | AI generation SLO failure, provider dependency noted | `external_ai_unavailable` |
| AI quota, credit, or rate limit | AI generation SLO failure, budget/quota follow-up | `external_ai_quota_exceeded` |
| Vercel platform outage | Track separately from app bug | `server_error` with platform note if known |

外部依存が原因でも、UIが未分類の500や曖昧なmessageだけを返した場合は、SayDeck側の改善対象にする。

## Metrics to Collect

初期ログでは次を集める。

- `route`
- `operation`
- `status`
- `code`
- `durationMs`
- `role`
- `provider`
- `model`
- `resource`
- `retryable`

`requestId` と correlation ID は #52 で扱う。長期保存とdashboardは #59 で扱う。

## Review Cadence

週次または大きな変更後に確認する。

- `/api/expressions/:id/generate` の失敗が分類済みか
- DB write失敗が `db_unavailable` に寄っているか
- durationが継続的に悪化していないか
- non-ownerの権限エラーが意図した403になっているか
- quota / rate limitが #56 の分類へ寄せられているか

## References

- Issue #50: ログ設計とSLA/SLO・エラーバジェット基盤を設計する
- Issue #51: obs: SLA/SLOとエラーバジェットの初期指標を定義する
- Issue #52: obs: リクエスト相関IDでUIからDB・外部APIまで追跡する
- Issue #56: obs: Grok APIのquota・credit不足・rate limitを判定してログとUIに反映する
- Issue #59: obs: サイト健全性ダッシュボードとアラートの初期設計を行う
- `docs/observability/error-taxonomy.md`
- `docs/observability/log-storage.md`
