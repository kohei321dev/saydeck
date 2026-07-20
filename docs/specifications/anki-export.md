# Anki Export Specification

- Status: Accepted
- Date: 2026-07-20
- Scope: SayDeckが生成する音声同梱`.apkg`

正式形式は、音声binaryを同梱する`.apkg`とする。TSVはフィールド確認・テキストバックアップ用の補助形式であり、音声を同梱しない。

DEVでTTS keyまたはprivate storageが未設定の場合、browser-speech fallbackはLibrary再生だけに使う。`browser-speech` assetは`audio_ready`およびAPKG exportの条件を満たさない。

## 1. 互換性の目標

参照サンプル`CHADScast_136_all_audio.apkg`と、field名・field順・音声fieldの役割を揃える。サンプルとbyte単位で同じpackage formatやdeck構造を再現することは目的に含めない。

対象は、現在のAnki Desktopでimportでき、AnkiWeb同期を経て標準クライアントで利用できることとする。

## 2. Note type

- Note type: `SayDeck ES1Kv2`
- Card template: `ES1K Vocab`
- Card count: 1 noteにつき1 card
- Front: `Word`と`word_audio`
- Back: `Word`、`Definition`、空でなければ`Irregular Forms`、`Example Sentence`、`Translation`、`sentence_audio`

`SayDeck ES1Kv2`のfield・template・CSSは公開後に変更しない。破壊的変更は新versionのnote typeを作る。

## 3. Field contract

| Ordinal | Field | Source | Required |
| --- | --- | --- | --- |
| 1 | `Index` | `sb_<stable-variant-id>` | Yes |
| 2 | `Word` | variantのキーフレーズ | Yes |
| 3 | `Definition` | `Word`の日本語の意味 | Yes |
| 4 | `Irregular Forms` | 不規則変化。なければ空 | No |
| 5 | `Example Sentence` | 確定した英文 | Yes |
| 6 | `Translation` | 英文の日本語訳 | Yes |
| 7 | `word_audio` | `[sound:saydeck_word_<id>.wav]` | Yes |
| 8 | `sentence_audio` | `[sound:saydeck_sentence_<id>.wav]` | Yes |

- `Index`は表示しない。Ankiの最初のfield重複判定と外部追跡のため、英文や`Word`ではなくstable IDを使う。
- `Irregular Forms`には不規則変化だけを入れ、文法説明やレビュー文を混在させない。
- AI由来本文はHTML escapeし、音声fieldだけが制御された`[sound:]`記法を持つ。

## 4. Deck、tags、IDs

- Deck: `SayDeck::<genre-slug>`
- Tags:
  - `source::saydeck`
  - `genre::<genre-slug>`
  - `situation::<situation-slug>`（0件以上）
  - `difficulty::<l1|l2|l3|l4>`
- `anki_guid`: variant作成時に一度生成し、DBへ保存する。exportのたびに生成し直さない。
- model ID: `SayDeck ES1Kv2`専用の定数。
- deck ID: deck名から決定的に得る値。exportごとに時刻由来のIDを使わない。

## 5. Media contract

- Format: WAV
- Pronunciation target: American English (`en-US`); provider voice and output are recorded in `audio_assets` so a voice change invalidates the asset.
- `word_audio`: key expressionを読み上げる。
- `sentence_audio`: example sentence全文を読み上げる。
- filenameはASCII安全文字だけを使い、variant IDを含めて一意にする。
- packageに含めるmediaとfieldの`[sound:]`参照は1対1で対応し、missing media・unreferenced mediaを許容しない。

## 6. Package lifecycle

1. ownerが`audio_ready` variantを選択する。`word`と`sentence`のprovider-backed assetが両方`ready`であることを検証する。
2. export serviceがDBのfields、tags、audio metadataを読み込む。
3. audio Blobを取得し、APKGへmediaとして同梱する。
4. packageをprivate Blobへ保存する。
5. browserにはexport IDを返し、owner認証済みdownload routeからpackageを取得する。

同じvariantを編集して再exportした場合、同じGUIDと`Index`を使う。Ankiのempty profileへ初回importし、編集後の再importで重複せず更新できることをrelease gateとする。現環境にAnki Desktopがない場合は、package内のSQLite/ZIP契約を自動検証し、実importは未検証として記録する。

## 7. API contract

- `POST /api/anki-exports`: `variantIds`、`tags`、`from`、`to`を受け取り、`{ export: { id, status, cardCount, filename } }`を返す。
- `GET /api/anki-exports/:id/download`: owner認証後、`application/vnd.anki`として`.apkg`をdownloadする。
- `POST /api/anki-exports/tsv`: 同じ絞り込み条件で補助TSVを返す。TSVには`[sound:]`参照を含められるが、media binaryは含めない。
