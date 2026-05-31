# ADR 0008: Neon Postgres practice records

- Status: Proposed
- Date: 2026-05-30

## Context

Scene Builderの現在の学習状態は、ブラウザのlocalStorageに保存している。

保存対象:

- 英語回答
- 完了状態
- 要復習状態
- 最終練習日時

localStorageだけでは、別端末、別ブラウザ、localStorage削除後に学習状態を復元できない。Ownerログイン済みの学習データをクラウドに保存し、Vercel運用でも継続利用できるようにしたい。

この判断は、データ保存先、外部サービス、運用コスト、移行性に関わるためADRとして残す。

## Decision

学習状態のクラウド保存先として、Neon Postgresを第一候補にする。

- 接続は `DATABASE_URL` を使う
- アプリ側は標準SQLと汎用Postgres clientを使う
- Neon固有APIに依存しない
- VercelにはMarketplace連携または環境変数で接続する
- DB未設定の環境ではlocalStorage fallbackを維持する
- 既存UIに合わせ、`answer` と学習状態を `practice_records` にupsertする

## Addendum: Scene cards in Neon

- Date: 2026-05-31

表示用サンプルカードとOwner生成カードもNeon/Postgresへ寄せる。カード本体は `scene_cards` に保存し、サンプルseedは `db/migrations/0002-scene-cards.sql` で管理する。

- `source = 'sample'`: 初期表示用のサンプルカード
- `source = 'owner'`: OwnerがAI生成した追加カード
- アプリはCSVではなく `scene_cards` から表示カードを読む
- `DATABASE_URL` 未設定時はサンプルカードを表示しない

## Options Considered

### Option A: Neon Postgres

- [事実] PostgreSQL互換のserverless Postgresとして使える
- [事実] Vercel Marketplace連携がある
- [判断] 小規模な個人学習ログには十分で、将来ほかのPostgresへ移行しやすい
- [判断] `DATABASE_URL` と標準SQL中心にすれば、ベンダーロックインを抑えられる
- [懸念] serverless DB特有の接続管理、cold start、無料枠制限は運用時に確認が必要

### Option B: Supabase Postgres

- [事実] SupabaseもPostgresを提供する
- [判断] Auth、Storage、Realtime、client SDKまで使う場合は強い
- [懸念] 今回はGitHub/Google OAuthと学習ログ保存が主目的で、Supabaseの周辺機能は過剰

### Option C: KV

- [判断] key-valueで現在状態だけを保存するなら実装は簡単
- [懸念] 要復習一覧、日別集計、カード別進捗、履歴分析が弱い

### Option D: Blob / Object Storage with JSON

- [判断] JSONファイル丸ごと保存なら単純に見える
- [懸念] 部分更新、検索、並行更新、集計に弱い

## Data Model Draft

```sql
create table practice_records (
  owner_login text not null,
  mode text not null,
  item_id text not null,
  level text not null,
  answer text not null default '',
  checks jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  review jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_login, mode, item_id, level)
);
```

`mode = 'topic'`、`item_id = cardId` として扱う。現在のUIにはセルフチェック専用フィールドがないため、`checks` には `isDone`、`needsReview`、`lastPracticedAt` をJSONとして保存する。

## API Direction

`/api/practice` を追加する。

- `GET`: `cardId`, `level` に対応する保存済み状態を返す
- `PUT`: `answer`, `isDone`, `needsReview`, `lastPracticedAt` をupsertする
- 認証済みOwnerのみ許可する
- DB未設定時はAPIを無効化し、UIはlocalStorageへfallbackする

## Security / Privacy

保存してよいもの:

- Owner GitHub login
- card ID
- level
- 短い英語回答
- 完了・要復習状態
- 作成・更新日時

保存しないもの:

- GitHub OAuth secret
- Google OAuth secret
- xAI API key
- raw provider response全体
- private URL
- billing details
- 長い会話ログ

## Operations

- Vercel Productionに `DATABASE_URL` を設定する
- Previewでログイン検証する場合は、Preview用OAuth callbackも別途用意する
- migration SQLはrepoに保存するが、secret値は保存しない
- 初期は単一Ownerのみを前提にする
- DB障害時はlocalStorage fallbackで学習画面を継続できるようにする

## Consequences

- 別端末・別ブラウザで学習状態を復元できる
- SQLで要復習、日別学習数、カード別進捗を拡張しやすい
- 標準Postgres中心にすることで移行性を残せる
- DB接続、migration、環境変数、障害時fallbackが必要になる

## Revisit Conditions

- 複数ユーザーへ広げる
- 音声、画像、添付教材など大きなファイルを保存する
- 学習履歴を時系列イベントとして分析したくなる
- Neonの制限やコストが運用に合わなくなる
- Vercel以外へhostingを移す

## References

- `docs/ADR.md`
- `docs/adr/0004-auth-and-user-logs.md`
- `docs/adr/0006-mvp-auth-prototype.md`
- Neon pricing: https://neon.com/pricing
- Neon on Vercel: https://vercel.com/marketplace/neon
- Neon manual Vercel connection: https://neon.com/docs/guides/vercel-manual
- Supabase pricing: https://supabase.com/pricing
- 『ソフトウェアアーキテクチャの基礎 第2版』
- 『システム思考の世界へ』
