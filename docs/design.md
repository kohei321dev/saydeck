# SayDeck 設計

- Status: Accepted
- Date: 2026-07-20
- Requirements: `docs/requirements.md`
- Anki contract: `docs/specifications/anki-export.md`

## 1. アーキテクチャ判断

これは全面リライトではなく、既存の練習機能と認証・Neon接続を残した部分的リアーキテクチャである。

```text
Japanese quick capture
  -> Expression entry (Neon)
  -> AI generation / semantic segmentation
  -> Human review and variant registration
  -> TTS + private audio storage
  -> Library playback / Anki package export
```

既存の`scene_cards`とpractice系テーブルは、旧カードの閲覧・学習履歴を保つために維持する。新しい表現カードは専用テーブルへ保存し、学習画面が必要とするDTOへ投影する。新旧テーブルへ二重書き込みはしない。

### MVP実装範囲（2026-07-20）

最初のMVPは、入力を失わずに教材化するための垂直スライスを対象とする。

- 実装済み: `/create`、`/library`、`/api/expressions`、`/api/expressions/:id/generate`、`/api/expressions/:id`
- 実装済み: 日本語入力のlocalStorage退避、L1〜L4候補生成、長文の意味単位分割、候補選択、Neon保存、ownerスコープ
- DEV実装済み: 登録済み表現の学習モード投影、登録日時、AI提案ジャンル・タグ、browser-speech fallback、個別・タグ・期間指定のexport導線
- 実装済みのproduction boundary: provider-backed TTS adapter、private binary storage adapter、音声同梱`.apkg` adapter、owner認証済みaudio/package download。provider keyとBlob tokenがないDEVではfallback/未readyとして扱う
- 次スライス: generation profile設定画面、Anki Desktop空profileへの実import/reimport E2E、TTS providerの米国発音voice確認

音声・AnkiのDB境界（`audio_assets`、`anki_exports`）とAnkiフィールド契約は先に確定している。外部providerとbinary生成を追加する際も、確定済みの本文と入力を失わないよう、text生成とは別ジョブとして実装する。

## 2. UI境界

| Route | 責務 | 主な操作 |
| --- | --- | --- |
| `/` | 既存学習フロー | 旧カードと登録済み新カードの練習 |
| `/create` | 思いつきの教材化 | 入力、AI生成、分割、確認、音声登録 |
| `/library` | 登録済みカードの管理 | 検索、タグ絞り込み、再生、export選択 |
`ScenePractice`へ新機能を継ぎ足さず、Capture/Editor、Library、AudioPlayer、ExportPanelを独立させる。既存UIの削除は、新UIが全ての必要導線を置換してから行う。

`/settings/generation`によるL1〜L4制約とTTS既定値の編集は次スライスとし、MVPではDBの既定profileと環境変数を使う。

## 3. 永続化モデル

### Neon/Postgres

| Table | Primary responsibility | Key fields |
| --- | --- | --- |
| `generation_profiles` | L1〜L4の生成制約 | `code`, `min_words`, `max_words`, `max_sentences`, `required_features`, `instruction` |
| `expression_entries` | 元の気づきと共通メタデータ | `id`, `owner_login`, `input_ja`, `situation_ja`, `genre_slug`, `situation_tags`, `status` |
| `sentence_cards` | 分割後の意味単位 | `id`, `entry_id`, `position`, `intent_ja` |
| `sentence_variants` | card×levelの確定候補 | `id`, `sentence_card_id`, `profile_code`, `english`, `japanese`, `key_expression`, `definition_ja`, `irregular_forms`, `anki_guid`, `status` |
| `audio_assets` | 音声metadata | `variant_id`, `kind`, `blob_path`, `text_hash`, `provider`, `model`, `voice`, `format`, `status` |
| `anki_exports` | package生成状態 | `owner_login`, `status`, `card_count`, `blob_path`, `error_code` |

外部入力やAI結果はHTMLとして保存しない。表示・Anki export時にテキストをescapeし、音声参照だけを制御された`[sound:filename]`形式で生成する。

### Object storage

- 音声: private Vercel Blobにimmutable pathで保存する。localhostでは、production以外に限り`.saydeck-storage`へ保存できる。
- APKG: private Vercel Blobに保存する。browserはowner認証済みdownload routeを通して取得し、Blob tokenやpathを返さない。
- DBにはpathとmetadataだけを保存し、binaryは保存しない。
- MVPでは本文変更時にassetを`stale`とし、再登録で同一variant/kindのmetadataを更新する。不要binaryの保持期間と削除jobは運用スライスで追加する。
- export artifactはownerごとに履歴を保持する。保持上限とcleanupは運用スライスで追加する。

## 4. サービス境界

| Module | Responsibility |
| --- | --- |
| `expression-store` | expression用のPostgres read/writeとowner scope |
| `expression-generation` | structured AI generation、制約検証、再生成 |
| `text-segmentation` | 分割案の正規化、順番、再生成対象の決定 |
| `ai/providers/*` | text AI providerとの通信。既存AI設定をadapterへ移す |
| `tts-provider` | 音声生成。text AIとはkey/model/voiceを分離する |
| `binary-store` | private BlobまたはDEV local storageのput/get |
| `anki-export` | DB modelからAnki modelへの純粋なprojectionとpackage生成 |
| `runtime-diagnostics` | DB、TTS、Blob、export adapterの利用可否を安全に返す |

AI生成とTTSを単一の同期処理へ結合しない。順序は「capture保存 → text生成 → 人間確認 → 選択variantのTTS → export」とする。

## 5. API境界

| Endpoint | Method | Responsibility |
| --- | --- | --- |
| `/api/expressions` | `POST`, `GET` | 入力保存、一覧取得 |
| `/api/expressions/:id/generate` | `POST` | 分割案とlevel別variant生成 |
| `/api/expressions/:id` | `PATCH` | metadata、分割、本文、選択状態の確定 |
| `/api/diagnostics?probe=1` | `GET` | owner向けDB接続・表現schema・AI provider疎通確認 |
| `/api/sentence-variants/:id/register` | `POST` | 文章検証、TTS、audio state更新 |
| `/api/audio/:assetId` | `GET` | owner認証後の音声stream |
| `/api/anki-exports` | `POST` | `audio_ready`の選択・タグ・期間でAPKG artifactを生成し、export IDを返す |
| `/api/anki-exports/:id/download` | `GET` | owner認証後にprivate APKGをstream download |
| `/api/anki-exports/tsv` | `POST` | フィールド確認・バックアップ用のTSV補助出力 |

すべてのmutationはowner認証を必須にする。raw textを含むエラー詳細はクライアントへ返さず、既存error taxonomyへprovider共通のquota/rate-limit分類を追加する。

`/api/generation-profiles` のowner更新APIは次スライスで追加する。

## 6. 音声とexport

- TTS既定: OpenAI互換Speech API、model `tts-1`、voice `alloy`、speed `1.0`、WAV。server-onlyの`SAYDECK_TTS_API_KEY`（または`OPENAI_API_KEY`）を使う。
- `word_audio`にはキーフレーズ、`sentence_audio`には英文全文を使う。
- hashは`kind + text + model + voice + speed + format`で計算し、冪等にする。
- APKG生成には`ankipack@0.1.3`をexact pinし、custom `SayDeck ES1Kv2` model、固定deck/model ID、固定GUID、2 mediaをadapter越しにだけ使用する。
- `sql.js` WASMをNode.js Route Handlerで初期化する。package bytesをFunction responseとして返さず、private storage保存後にowner認証download routeから取得する。
- `ankipack`の互換性gateに失敗した場合は、adapterだけを公式Anki backendを使うworkerへ置き換える。TSV-onlyへ仕様を下げない。

## 7. 削除・移行方針

### 今回削除するもの

- 旧日記CSV、旧語彙CSV、手動AI添削prompt、初期実装計画。

### 置換完了後に削除するもの

- 旧`ScenePractice`、旧cards/review/practice/notes API、旧カード生成・練習store、旧Practice向けCSS。

削除gateは、新`/create`、`/library`、音声再生、APKG export、既存練習履歴の表示が動作し、回帰テストを通過していることとする。DB migration `0001`〜`0003`は適用済み環境の再現性のため削除しない。

## 8. 受け入れ・運用

- 日本語入力がAI失敗時も残る。
- 長文が意味単位に分割され、タグが継承される。
- text編集後に音声がstaleになる。
- private音声・APKGにowner以外がアクセスできない。
- 生成APKGをAnki Desktopの空profileへimportし、8 field、deck、tags、2音声、再import更新を確認する。
- `lint`、`typecheck`、`build`、unit/integration/E2Eを通す。
