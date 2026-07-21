# SayDeck

現実の場面で「こう言いたい」と思った日本語を、AIでAnki向けの英語表現へ変換・蓄積し、米国英語音声付きAPKGとして書き出す個人向けアプリです。

スケートボード場面を主な出発点にしつつ、日常会話や旅行などにも使える表現を蓄積します。

## Production

- [SayDeckを開く](https://scene-builder-tau.vercel.app)

## Current direction

```text
INPUT: 日本語の言いたいこと + シチュエーション
  -> AIがL1〜L4の基本ワード・例文・Ankiフィールドを生成
  -> 確認・修正してDBへ保存
LISTS: ジャンル・シチュエーション・レベル・作成日時で一覧・選択
EXPORT: 米国英語音声を内部生成し、音声同梱Anki APKGをdownload
```

SayDeckの主要画面は`INPUT`、`LISTS`、`EXPORT`の3つです。アプリ内学習・AI添削・練習履歴は現行要件に含めず、復習はAnkiで行います。正式なexport形式はAPKGのみで、TSVや個別WAV操作は提供しません。

MVP実装は、最初に旧学習・TSV・手動音声導線を削除し、その後`INPUT` → `LISTS` → `EXPORT`の順で進めます。

## Documentation

- [Product Brief](docs/product-brief.md)
- [要求定義](docs/requirements.md)
- [設計](docs/design.md)
- [Anki Export Specification](docs/specifications/anki-export.md)
- [ADR 0010: Expression capture and Anki export pipeline](docs/adr/0010-expression-capture-and-anki-export.md)
- [ADR 0011: Rename to SayDeck](docs/adr/0011-rename-to-saydeck.md)
- [ADR 0013: Expression production and APKG-only product scope](docs/adr/0013-expression-production-and-apkg-only.md)
- [既存ADR運用ガイド](docs/ADR.md)

旧アプリ名由来のブラウザ保存キーと本番domainは、既存データとOAuthを守るために移行完了まで維持する。詳細はADR 0011とdeployment guideを参照する。

## Local development

```bash
npm install
DEV_AUTH_BYPASS=1 npm run dev
```

`DEV_AUTH_BYPASS=1`はローカル確認専用です。`NODE_ENV=production`では無効になります。

表現作成を実データで確認する場合は、`DATABASE_URL`を設定し、既存migrationに続けて
`db/migrations/0004-saydeck-expressions.sql`と`0005-expression-learning-and-export.sql`をNeonへ適用してください。英文候補の生成には
server-sideの`OWNER_AI_KEY`（許可モデル`grok-4.3`）も必要です。どちらかが未設定でも、入力画面は表示され、DB保存失敗時は入力をlocalStorageへ退避します。

`LISTS`では生成済み表現を個別選択し、ジャンル、シチュエーション、レベル、作成日時などで絞り込めます。`EXPORT`では選択した表現から米国英語音声付き`.apkg`を作成します。音声生成はAPKG作成の内部処理です。TTS keyがあれば、Blob tokenがないlocalhostでも`.saydeck-storage`を使ってAPKGまで検証できます。

ownerでログインした状態では、既存画面の診断パネルからDB接続、表現schema、AI providerの疎通を確認できます。APIでは`GET /api/diagnostics?probe=1`が同じ確認を行い、secretやprovider本文は返しません。

### Vercel環境変数をlocalhostで使う場合

localhostはVercelのProduction環境ではないため、Vercelの値を自動継承しません。ローカルではProduction用secretを直接使わず、Development用の限定された`DATABASE_URL`とAI keyをVercelに登録してから、次のように取得します。

```bash
npx vercel env pull .env.local --environment=development --project saydecks --scope uechikoheis-projects --yes
DEV_AUTH_BYPASS=1 npm run dev
```

secretをローカルファイルへ書きたくない場合は、VercelのDevelopment runtimeで起動します。

```bash
DEV_AUTH_BYPASS=1 npx vercel dev --project saydecks --scope uechikoheis-projects --listen 3000
```

現在のプロジェクトではDevelopment/Previewの環境変数は未登録です。ProductionのsecretはVercel CLIでも`[sensitive]`としてマスクされるため、Production secretをlocalhostへコピーする運用にはしません。Development環境を追加できない場合は、ownerログイン後のVercel runtime probeでProduction接続を確認してください。

```bash
npm run lint
npm run typecheck
npm run build
```

## Current persistence

- Neon/Postgres: 表現入力、意味単位、L1〜L4 variant、分類metadata、Anki index、音声metadata、export状態。旧カード・練習状態・練習履歴・保存ノートは移行安全性のため当面保持するが、現行UIでは使用しない。
- private object storage: 新仕様の音声binaryとAPKG artifact。本文やAPI keyは保存しない。
- local development storage: TTS/APKGのlocalhost検証時だけ`.saydeck-storage`へ保存できる。Productionではprivate Blobを必須にする。
- localStorage: 未同期のQuick Capture入力だけを一時退避する。

現在のDB migrationは順に適用します。

1. `db/migrations/0001-practice-records.sql`
2. `db/migrations/0002-scene-cards.sql`
3. `db/migrations/0003-practice-attempts-and-saved-notes.sql`
4. `db/migrations/0004-saydeck-expressions.sql`
5. `db/migrations/0005-expression-learning-and-export.sql`
6. `db/migrations/0006-apkg-only-cleanup.sql`

音声付きAPKGは、英文候補生成と同じserver-onlyの`OWNER_AI_KEY`でxAI Text to Speechを呼び出します。Productionでは`BLOB_READ_WRITE_TOKEN`も設定します。`SAYDECK_TTS_VOICE`、`SAYDECK_TTS_SPEED`でxAI TTSの既定値を変更できます。

migration runnerはまだ導入していないため、Neonへ上記の順で手動適用します。既存migrationは適用済み環境の再現性のため削除しません。

## Security

- API key、OAuth secret、Blob token、raw AI responseはGitへ保存しない。
- 書き込み・音声再生・APKG downloadはowner認証で保護する。
- 認証、Vercel、Neonの現行設定は[deployment guide](docs/vercel-deployment.md)を参照する。

## License

MIT License. See `LICENSE`.
