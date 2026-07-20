# SayDeck 設計

- Status: Accepted
- Date: 2026-07-20
- Requirements: `docs/requirements.md`
- Anki contract: `docs/specifications/anki-export.md`
- Decision: `docs/adr/0013-expression-production-and-apkg-only.md`

## 1. アーキテクチャ判断

SayDeckを、英語表現の生成・蓄積とAnki向けAPKG出力に特化する。

```text
INPUT
  Japanese intent + situation
    -> AI structured generation (L1-L4)
    -> Human review
    -> Expression fields + metadata (Neon)

LISTS
  Saved expressions
    -> Search / filter / logical grouping
    -> Select variants

EXPORT
  Selected variants
    -> en-US TTS (internal)
    -> APKG projection + bundled media
    -> Authenticated download
```

アプリ内学習、AI添削、練習履歴は現行product domainから外す。旧practice系テーブルとmigrationはデータ保全のため残すが、現行画面へ投影せず、新domainへ二重書き込みしない。

## 2. UI境界

| Route | Navigation label | Responsibility | 主な操作 |
| --- | --- | --- | --- |
| `/input` | `INPUT` | 日本語入力、AI生成、確認、DB保存 | 表現を生成して保存 |
| `/lists` | `LISTS` | 一覧、検索、複合filter、編集、選択 | 選択してEXPORTへ |
| `/export` | `EXPORT` | 対象確認、音声/APKG生成、download | APKGを作成 |

- `/`は`/input`へredirectする。
- 主要navigationは3項目だけにする。
- `/create`と`/library`は新routeへ移行後redirectし、呼称もINPUT/LISTSへ統一する。
- 旧学習UI、Owner deck、AI添削、練習状態、TSV、個別音声生成ボタンは表示しない。
- audio assetの形式や生成単位は内部詳細とし、EXPORTでは「APKGを作成」という利用目的だけを主操作にする。

## 3. 永続化モデル

### Neon/Postgres

| Table | Primary responsibility | Key fields |
| --- | --- | --- |
| `generation_profiles` | L1〜L4の生成制約 | `code`, `min_words`, `max_words`, `max_sentences`, `required_features`, `instruction` |
| `expression_entries` | 元の入力と共通metadata | `id`, `owner_login`, `input_ja`, `situation_ja`, `genre_slug`, `situation_tags`, `created_at`, `updated_at` |
| `sentence_cards` | 分割後の意味単位 | `id`, `entry_id`, `position`, `intent_ja` |
| `sentence_variants` | 意味単位×levelのAnki候補 | `id`, `sentence_card_id`, `profile_code`, `english`, `japanese`, `key_expression`, `definition_ja`, `irregular_forms`, `anki_guid`, `status` |
| `audio_assets` | APKG用音声metadata | `variant_id`, `kind`, `blob_path`, `text_hash`, `provider`, `model`, `voice`, `locale`, `format`, `status` |
| `anki_exports` | package生成状態 | `owner_login`, `status`, `card_count`, `blob_path`, `error_code` |

`Deck`は永続化された固定グループではなく、ジャンル、シチュエーション、レベル、作成日時などのfilterから組み立てる論理グループとする。将来、名前付きfilterの保存需要が確認できた場合だけ別modelを追加する。

### Object storage

- 音声とAPKGはprivate object storageへ保存する。localhostではproduction以外に限り`.saydeck-storage`を利用できる。
- DBにはpathとmetadataだけを保存し、binaryは保存しない。
- 本文またはTTS設定変更時は対応assetを`stale`にし、次回export時に再生成する。
- browserはowner認証済みdownload routeを通してAPKGを取得し、storage tokenや内部pathを受け取らない。

## 4. サービス境界

| Module | Responsibility |
| --- | --- |
| `expression-store` | expression用Postgres read/write、owner scope、LISTS query |
| `expression-generation` | structured AI generation、制約検証、再生成 |
| `text-segmentation` | 意味単位の分割、順序、再生成対象の決定 |
| `ai/providers/*` | text AI providerとの通信 |
| `tts-provider` | `en-US`を明示したAPKG用音声生成 |
| `binary-store` | private object storageまたはDEV local storageのput/get |
| `anki-export` | DB modelからAnki modelへのprojection、音声準備、package生成 |
| `runtime-diagnostics` | DB、AI、TTS、storage、APKG adapterの利用可否を安全に返す |

AIテキスト生成とTTSは障害境界を分ける。通常順序は「INPUT保存 → AI生成 → 人間確認 → DB保存 → LISTS選択 → EXPORT時に音声準備 → APKG生成」とする。

## 5. API境界

| Endpoint | Method | Responsibility |
| --- | --- | --- |
| `/api/expressions` | `POST`, `GET` | 入力保存、LISTS取得・filter |
| `/api/expressions/:id/generate` | `POST` | 分割案とlevel別Anki候補生成 |
| `/api/expressions/:id` | `GET`, `PATCH` | 詳細取得、metadata・本文・選択状態の更新 |
| `/api/anki-exports` | `POST` | 選択条件検証、en-US音声準備、APKG生成、export ID返却 |
| `/api/anki-exports/:id/download` | `GET` | owner認証後にprivate APKGをstream download |
| `/api/diagnostics?probe=1` | `GET` | owner向けDB・AI・TTS・storage・APKG疎通確認 |

`/api/sentence-variants/:id/register`、`/api/audio/:id`、`/api/anki-exports/tsv`は現行UIでは不要であり、APKG生成フローへ統合後に削除する。音声previewが将来必要になった場合も、米国英語assetを読み取り専用で再生し、生成ボタンは追加しない。

## 6. 音声とAPKG

- TTS requestではprovider、model、voice、locale `en-US`、speed、formatを明示する。
- 日本語voiceやブラウザ既定voiceへのfallbackは禁止する。失敗時はexportを失敗として返し、再試行可能にする。
- APKG contract上の`word_audio`と`sentence_audio`に対応するmediaは内部で個別生成するが、APKGが一括同梱するため利用者はWAVを個別管理しない。
- hashは`kind + text + model + voice + locale + speed + format`で計算し、同じassetを再利用する。
- APKG生成にはadapterを使い、固定note type、固定model/deck ID、固定GUID、2 mediaを検証する。
- 正式exportはAPKGだけとし、TSV生成コードとUIを削除する。

## 7. 削除・移行方針

### 現行UIから削除するもの

- 旧`ScenePractice`と学習navigation
- 旧カード、Owner deck、AI添削、回答、採点、完了・要復習UI
- 新規表現を学習画面へ投影する処理
- browser-speech fallback
- 個別の語句音声・例文音声・WAV生成または登録ボタン
- TSV export UIとAPI

### 当面保持するもの

- 旧`scene_cards`、`practice_records`、`practice_attempts`、`saved_notes`のDB tableとmigration
- 既存データを復旧・退避するために必要な読み取り可能性

削除実装では、INPUT・LISTS・EXPORTおよび認証、現行expression schema、APKG exportに依存するコードを巻き込まない。不要tableのdropは別の明示的なデータ移行判断まで行わない。

## 8. 受け入れ・運用

- INPUTで日本語入力がAI失敗時も残る。
- L1〜L4の各候補が固定Ankiフィールドへ対応し、DBへ保存される。
- LISTSでジャンル、シチュエーション、レベル、作成日時を組み合わせて絞り込める。
- UIの主要navigationがINPUT、LISTS、EXPORTだけである。
- 音声生成ボタンとTSV導線が存在しない。
- 固定fixtureのWordとExample Sentenceを試聴し、米国英語発音であることを人間が確認する。
- 生成APKGをAnki Desktopの空profileへimportし、8 field、tags、2音声、再import更新を確認する。
- private APKGにowner以外がアクセスできない。
- `lint`、`typecheck`、`build`、unit/integration/E2Eを通す。

## 9. 実装シーケンス

```text
Phase 1: Remove legacy learning / TSV / manual audio UI
  -> Phase 2: Build INPUT
  -> Phase 3: Build LISTS
  -> Phase 4: Build APKG-only EXPORT with en-US audio
```

- 各phaseは独立したIssueとし、直前phaseの完了を着手条件にする。
- Phase 1は不要機能の削除に限定し、旧DB tableのdropは行わない。
- Phase 2〜4では旧実装への互換投影を追加しない。
- 各phaseでnavigation、API、dead code、テスト、文書の残存参照を確認する。
