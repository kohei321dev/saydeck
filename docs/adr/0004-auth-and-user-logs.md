# ADR 0004: Auth and user logs

- Status: Proposed
- Date: 2026-05-24

## Context

Scene Speakは最初は個人用だが、URLを知っている人が使える学習サイトに拡張できる可能性がある。

ただし、AI Reviewを公開URLから誰でも叩ける状態にすると、API利用料が予測できなくなる。学習履歴やユーザー別ログも、認証なしでは扱いにくい。

## Decision

段階的に認証を入れる。

### Phase 0: No Auth

- 静的教材を見るだけ
- localStorageに自分の入力を保存
- AI Reviewは未実装またはdisabled

### Phase 1: Owner-only Auth

- GitHubログインまたはClerkで認証
- allowlistに自分のuser IDまたはemailを設定
- AI Reviewはallowlist userだけ実行可能
- ログはlocalStorage中心、必要ならserver logは最小限

### Phase 2: Invited Users

- allowlistを複数人に拡張
- ユーザー別に学習履歴を保存
- request数とAI利用量をuser別に集計

### Phase 3: Public With Quotas

- Google/GitHub loginを許可
- free quotaを設定
- abuse対策、rate limit、利用規約、privacy noteを追加

## Auth Candidate

初期は以下のどちらか。

- Clerk: Vercelとの相性がよく、GitHub/Google login、allowlist、ユーザー管理を早く作れる
- Auth.js: 依存は軽いが、provider設定、session、adapterを自分で組む範囲が広い

MVPではClerkを第一候補にする。理由は、認証そのものを作り込むより、英語学習体験とAI Reviewの品質確認に集中したいため。

## Log Policy

保存してよいもの:

- `user_id`
- `card_id`
- `level`
- `score`
- `created_at`
- 短いuser answer
- AI review result

初期に保存しないもの:

- secret
- API key
- raw provider response全体
- private URL
- provider billing details
- 長い会話ログ

## Consequences

### Positive

- 最初は自分だけ安全にAI Reviewを試せる
- 将来、友人や小規模ユーザーへ広げやすい
- user別の進捗・復習カードに拡張できる

### Negative

- 認証providerの設定が必要
- Google/GitHub OAuth設定やcallback URL管理が必要
- DB保存を始める場合はprivacyと削除方針を決める必要がある

