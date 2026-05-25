# Scene Builder

英検3級レベルから、日常会話で使える英語を増やすための個人学習プロジェクトです。

目的は、スピーキングの前段にある「自分が言いたいことを短い英文にする力」を鍛えることです。まずはスケボー中に外国人の友達と話す場面を中心に、トピックカード、短い日記、難易度別の模範回答を蓄積します。

## Current Direction

- project name: `Scene Builder`
- repository name: `scene-builder`
- 学習者: 英検3級程度
- 目標: 日常会話、特にスケボー場面で自分の経験や質問を言えること
- 課題: 話したい内容があっても、英文として頭に出てこない
- 方針: スピーキングだけでなく、短いライティングを先に鍛える
- 初期教材: スケボー場面のトピックカードと短い日記プロンプト
- 初期実装: 静的データをVercelなどで閲覧できる形にする
- AI利用: 最初はChatGPT等で教材生成・添削し、リアルタイムAI採点は後続検討

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
- `docs/vercel-deployment.md`: Vercel、GitHub OAuth、xAI env設定手順
- `data/topic-cards.csv`: スケボー会話向けトピックカード
- `data/diary-prompts.csv`: 短い英語日記の練習プロンプト
- `data/vocabulary.csv`: 使い回したい語彙・表現

## Local Development

```bash
npm install
DEV_AUTH_BYPASS=1 npm run dev
```

`DEV_AUTH_BYPASS=1` はローカル確認用です。`NODE_ENV=production` では無効になります。

GitHub SSOとGrok reviewを使う場合は、`.env.example` を参考に `.env.local` を作成してください。実secret値はcommitしません。Vercelへ設定する値は `docs/vercel-deployment.md` を参照してください。

## License

MIT License. See `LICENSE`.

## Feasibility Summary

静的なカード表示、難易度別の模範回答、学習履歴の蓄積はすぐ実現できます。一方で、ユーザー入力に対する自然な採点・添削・言い換え提案は、静的サイトだけでは限界があります。最初は模範回答とセルフチェックで始め、必要になった段階でVercel FunctionsなどからAI APIを呼ぶ構成に拡張します。
