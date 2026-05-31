# Scene Builder

英検3級レベルから、日常会話で使える英語を増やすための個人学習プロジェクトです。

目的は、スピーキングの前段にある「自分が言いたいことを短い英文にする力」を鍛えることです。まずはスケボー中に外国人の友達と話す場面を中心に、トピックカード、短い日記、難易度別の模範回答を蓄積します。

## Production

https://scene-builder-tau.vercel.app

## Current Direction

- project name: `Scene Builder`
- repository name: `scene-builder`
- 学習者: 英検3級程度
- 目標: 日常会話、特にスケボー場面で自分の経験や質問を言えること
- 課題: 話したい内容があっても、英文として頭に出てこない
- 方針: スピーキングだけでなく、短いライティングを先に鍛える
- 初期教材: スケボー場面のトピックカードと短い日記プロンプト
- 初期実装: Neon/Postgres上のサンプルカードをVercelなどで閲覧できる形にする
- AI利用: Grok/xAI APIで回答添削とowner向けカード生成を行う

## Learning Loop

1. 日本語または英語のトピックカードを見る。
2. 自分で短い英文を書く。音声入力を使ってもよい。
3. 難易度別の模範回答を見る。
4. 自分の回答を、語順・動詞・形容詞・理由づけの観点で直す。
5. 使えそうな表現をカードとして蓄積する。

## Repository Structure

- `docs/product-brief.md`: 学習課題、MVP、実現可能性
- `docs/adr/`: 設計判断の記録
- `docs/prompt-templates/`: AIに問題生成や添削を頼むためのテンプレート
- `db/migrations/0002-scene-cards.sql`: スケボー会話向けサンプルカード
- `data/diary-prompts.csv`: 短い英語日記の練習プロンプト
- `data/vocabulary.csv`: 使い回したい語彙・表現

## Local Development

```bash
npm install
DEV_AUTH_BYPASS=1 npm run dev
```

`DEV_AUTH_BYPASS=1` はローカル確認用です。`NODE_ENV=production` では無効になります。

## GitHub Login Setup

GitHub OAuth Appを作り、callback URLに次を設定します。

```text
https://your-vercel-url/api/auth/callback/github
```

Vercel Environment Variablesに次を設定します。

- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `AUTH_SECRET`
- `NEXTAUTH_URL=https://your-vercel-url`
- `OWNER_GITHUB_USERNAME=kohei321dev`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `GROK_API_KEY`
- `GROK_MODEL=grok-4.3`
- `GROK_REASONING_EFFORT=none`
- `DATABASE_URL`

`OWNER_GITHUB_USERNAME` と一致するGitHub loginはownerとして利用できます。Googleログインユーザーはguestとしてカード閲覧、回答、AI添削を利用できます。

Google OAuth Clientには次のcallback URLを設定します。

```text
https://your-vercel-url/api/auth/callback/google
```

ownerログイン後、カード追加パネルの「設定診断」からAuth、Google、Database、AI key、AI model、`NEXTAUTH_URL`、カード保存先の設定状態を確認できます。secret値そのものは表示しません。

サンプルカードとOwnerがAIで生成したカードは、Neon/Postgresの `scene_cards` から読み込みます。Owner生成カードも同じテーブルへ保存されるため、再読み込み後や別ブラウザでOwnerログインした場合も表示されます。`DATABASE_URL` が未設定の場合、カード一覧は空になり、カード追加は同じブラウザのlocalStorage fallbackでのみ確認できます。

## Neon Postgres

NeonなどのPostgresに以下のmigrationを順番に適用し、Vercel Production/Previewに `DATABASE_URL` を設定します。

1. `db/migrations/0001-practice-records.sql`
2. `db/migrations/0002-scene-cards.sql`

`DATABASE_URL` が未設定の場合、学習状態は従来どおりブラウザのlocalStorageに保存されます。

## License

MIT License. See `LICENSE`.

## Feasibility Summary

静的なカード表示、難易度別の模範回答、学習履歴の蓄積はすぐ実現できます。一方で、ユーザー入力に対する自然な採点・添削・言い換え提案は、静的サイトだけでは限界があります。最初は模範回答とセルフチェックで始め、必要になった段階でVercel FunctionsなどからAI APIを呼ぶ構成に拡張します。
