# App Implementation Plan

## Recommended Start

最初は「教材データを見やすくする静的Webアプリ」として始める。

おすすめ構成:

- Next.js App Router
- TypeScript
- CSVをbuild時またはclient側で読み込み
- 学習状態はlocalStorageに保存
- deploy先はVercel

Next.jsを選ぶ理由は、最初は静的表示だけで始められ、後でAI review用のRoute Handlerを追加しやすいため。

project nameは `Scene Speak`、repository nameは `scene-speak` とする。

## MVP Screen

最初の画面は学習用ツールとして作る。ランディングページは作らない。

必要なUI:

- カテゴリ選択
- トピックカード一覧
- 難易度切替
- 自分の回答入力欄
- 模範回答表示
- セルフチェック
- 学習済み/要復習の切替

## Data Flow

### Static Mode

1. `data/topic-cards.csv` を読み込む
2. `card_id` ごとにまとめる
3. `level` で模範回答を切り替える
4. ユーザー回答はlocalStorageに保存する
5. セルフチェック結果もlocalStorageに保存する

この段階では、意味理解を伴う自動採点はしない。

### AI Review Mode

後続で追加する場合:

1. 認証済みユーザーだけがブラウザから `/api/review` に回答を送る
2. server側でAI APIを呼ぶ
3. JSON形式で10点満点、修正文、自然な言い換え、覚える表現を返す
4. 初期はlocalStorageに保存し、後続でDB保存に移す

API keyはclientに置かない。Vercel Environment Variablesに置く。

## Scoring Strategy

静的MVPでは、点数を自動計算せず、セルフチェックにする。

例:

- 言いたい内容が入っている
- 主語と動詞がある
- 時制が合っている
- 模範回答から1つ表現を盗めた
- 次に同じ場面で声に出せそう

AI reviewを入れる場合は、以下の5項目を各0-2点にする。

- Task fit
- Grammar
- Vocabulary
- Naturalness
- Conversation usefulness

## First Implementation Tasks

1. `package.json` を作る
2. Next.js, TypeScript, ESLintを入れる
3. CSV loaderを作る
4. カード一覧画面を作る
5. カード練習画面を作る
6. localStorage保存を入れる
7. AI review routeのinterfaceだけ決める
8. GitHub OAuthまたはClerkで本人だけログイン可能にする
9. Vercel deployを確認する

## Risks

[事実] 静的サイトでは、自由入力の自然な採点はできない。

[推測] 最初にAI採点を作り込むと、学習データ作成よりも実装・費用管理・secret管理に時間を取られる。

[未検証] 実際にどのカード形式が継続しやすいかは、数日使ってから調整する必要がある。

[未検証] Grok/xAI APIとGroqCloud APIのどちらを使うかは、手元のAPI keyのprovider確認後に確定する。

