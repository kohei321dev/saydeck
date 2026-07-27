# SayDeck

現実の場面で「こう言いたい」と思った日本語を、AIでAnki向けの英語表現へ変換・蓄積し、米国英語音声付きAPKGとして書き出す個人向けアプリです。

## Production

- [SayDeckを開く](https://scene-builder-tau.vercel.app)

## Product flow

```text
INPUT
  日本語の「言いたいこと」
  → AIが意味単位、主・副シチュエーション、英語表現を提案
  → ユーザーが分類と候補を確認して保存

LISTS
  主・副シチュエーション、表現レイヤー、登録日、キーワードで一覧
  → 英文・和訳の編集、削除、EXPORT対象の選択

EXPORT
  選択した英文のen-US音声を内部生成
  → SayDeckノート5フィールドと音声を1つのAPKGへ同梱
```

主要画面は`INPUT`、`LISTS`、`EXPORT`の3つです。アプリ内学習、AI添削、練習履歴は扱わず、復習はAnkiで行います。正式な出力形式はAPKGだけで、TSVや個別WAV操作は提供しません。

表現レイヤーは次の4つです。

- `01_基本表現`（`basic`）: 各意味単位に必須。1文・原則12語以内で、1つの発話行為だけを標準的な語順で伝える最小表現
- `02_詳細表現`（`detail`）: 理由、条件、時刻・数量、追加依頼などの具体情報を加える場合だけ
- `03_会話表現`（`conversation`）: 明確に異なる口語表現がある場合だけ。短くてもよく、`basic`より難しいことは要件にしない
- `04_別の自然な言い方`（`natural_alternative`）: 別構文・別視点の自然な表現がある場合だけ

## Documentation

- [Product Brief](docs/product-brief.md)
- [要求定義](docs/requirements.md)
- [設計](docs/design.md)
- [Anki Export Specification](docs/specifications/anki-export.md)
- [Situation-first data flow](docs/uiux/proposed-situation-first-data-flow.html)
- [ADR 0016: Situation-first expression and Anki contract](docs/adr/0016-situation-first-expression-and-anki-contract.md)
- [Deployment guide](docs/vercel-deployment.md)

過去のADRとmigrationは意思決定・適用履歴として残します。現行仕様は上記の要求定義、設計、APKG仕様、ADR 0016を正本とします。

## Local development

```bash
npm install
npm run dev
```

ローカル画面確認では`.env.local`に`DEV_AUTH_BYPASS=1`を設定できます。この設定は`NODE_ENV=production`では無効です。

実データを使う場合は次のserver-side環境変数を設定します。

```text
DATABASE_URL
OWNER_AI_KEY
OWNER_AI_MODEL=grok-4.3
SAYDECK_TTS_VOICE=eve
SAYDECK_TTS_SPEED=1.0
```

localhostではBlob tokenがなくても`.saydeck-storage`へ音声・APKGを保存できます。Productionではprivate Blob用の`BLOB_READ_WRITE_TOKEN`が必要です。

## Database migrations

migration runnerは未導入のため、次を番号順に手動適用します。

1. `db/migrations/0001-practice-records.sql`
2. `db/migrations/0002-scene-cards.sql`
3. `db/migrations/0003-practice-attempts-and-saved-notes.sql`
4. `db/migrations/0004-saydeck-expressions.sql`
5. `db/migrations/0005-expression-learning-and-export.sql`
6. `db/migrations/0006-apkg-only-cleanup.sql`
7. `db/migrations/0007-situation-tag-taxonomy.sql`
8. `db/migrations/0008-situation-first-expression-contract.sql`
9. `db/migrations/0009-refine-expression-layer-definitions.sql`

`0008`は承認済みの破壊的migrationです。既存のSayDeck表現、音声metadata、APKG履歴を削除し、ジャンル、旧シチュエーションタグ、L1〜L4、旧8フィールド・2音声契約を新仕様へ置き換えます。旧practice系テーブルは削除しません。

`0009`は保存済みの表現を変更せず、`generation_profiles`の表現レイヤー定義を更新します。`basic`を1文・原則12語以内の最小表現とし、条件・理由・数量・追加依頼を`detail`または別の意味単位へ分けます。

ローカルでVercel Development環境を取得する場合:

```bash
npx vercel env pull .env.local --environment=development --project saydecks --scope uechikoheis-projects --yes
npm run dev
```

## Verification

```bash
npm run lint
npm run typecheck
npm run build
```

owner認証済みの`GET /api/diagnostics?probe=1`では、secretを返さずにDB、現行expression schema、AI、TTS、storageの設定状態を確認できます。

リリース前には、[Anki Export Specification](docs/specifications/anki-export.md)の手動確認に従い、空のAnki profileで初回importと同一variantの再importを確認します。

## Persistence

- Neon/Postgres: 日本語入力、意味単位、英語表現、主・副分類、主分類内連番、恒久Anki ID、音声metadata、export履歴
- private object storage: en-US英文音声とAPKG artifact
- localStorage: 未同期のINPUTと任意の優先主シチュエーションだけ
- sessionStorage: LISTSからEXPORTへ渡す一時的なvariant選択

## Security

- API key、OAuth secret、Blob token、raw AI responseをGitやapplication logへ保存しない。
- DB・AI・TTS・storageはserver側からだけ利用する。
- 作成・編集・削除・APKG downloadはowner認証で保護する。

## License

MIT License. See `LICENSE`.
