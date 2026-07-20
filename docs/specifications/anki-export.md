# Anki Export Specification

- Status: Accepted
- Date: 2026-07-20
- Scope: SayDeckが生成する米国英語音声同梱`.apkg`

正式なexport形式は`.apkg`だけとする。TSV、CSV、個別WAV downloadは提供しない。

APKGは内部に複数のmedia fileを保持する形式だが、利用者には単一packageとして提供される。利用者が音声fileを個別生成、download、配置する必要はない。

## 1. 互換性の目標

参照サンプル`CHADScast_136_all_audio.apkg`とfield名、field順、音声fieldの役割を揃える。サンプルとbyte単位で同じpackage formatやdeck構造を再現することは目的に含めない。

対象は、現在のAnki Desktopでimportでき、AnkiWeb同期を経て標準クライアントで利用できることとする。

## 2. Note type

- Note type: `SayDeck ES1Kv2`
- Card template: `ES1K Vocab`
- Card count: 1 noteにつき1 card
- Front: `Word`と`word_audio`
- Back: `Word`、`Definition`、空でなければ`Irregular Forms`、`Example Sentence`、`Translation`、`sentence_audio`

`SayDeck ES1Kv2`のfield、template、CSSは公開後に破壊的変更をしない。破壊的変更は新versionのnote typeを作る。

## 3. Field contract

| Ordinal | Field | Source | Required |
| --- | --- | --- | --- |
| 1 | `Index` | `saydeck_<stable-variant-id>` | Yes |
| 2 | `Word` | variantの基本ワードまたはキーフレーズ | Yes |
| 3 | `Definition` | `Word`の日本語の意味 | Yes |
| 4 | `Irregular Forms` | 不規則変化。なければ空 | No |
| 5 | `Example Sentence` | 確定した英語例文 | Yes |
| 6 | `Translation` | 例文の日本語訳 | Yes |
| 7 | `word_audio` | `[sound:saydeck_word_<id>.wav]` | Yes |
| 8 | `sentence_audio` | `[sound:saydeck_sentence_<id>.wav]` | Yes |

- AIは`Word`から`Translation`までの意味内容を構造化して生成する。
- `Index`、GUID、音声filenameと`[sound:]`参照はシステムが生成する。
- `Index`は表示しない。Ankiの先頭field重複判定と外部追跡のため、英文や`Word`ではなくstable IDを使う。
- `Irregular Forms`には不規則変化だけを入れ、文法説明やレビュー文を混在させない。
- AI由来本文はHTML escapeし、音声fieldだけが制御された`[sound:]`記法を持つ。

## 4. Deck、tags、IDs

- Deck既定値: `SayDeck::<genre-slug>`
- Tags:
  - `source::saydeck`
  - `genre::<genre-slug>`
  - `situation::<situation-slug>`（0件以上）
  - `difficulty::<l1|l2|l3|l4>`
  - `created::<yyyy-mm>`
- LISTS上の絞り込みやグループは固定deckと同一視しない。export時に選択した表現を、既定deckまたは指定deck名へまとめる。
- `anki_guid`はvariant作成時に一度生成し、DBへ保存する。exportのたびに生成し直さない。
- model IDは`SayDeck ES1Kv2`専用の定数とする。
- deck IDはdeck名から決定的に得る値とし、exportごとに時刻由来のIDを使わない。

## 5. Media contract

- Pronunciation target: American English (`en-US`)
- `word_audio`: `Word`を読み上げる。
- `sentence_audio`: `Example Sentence`全文を読み上げる。
- provider requestではmodel、voice、locale `en-US`、speed、formatを明示する。
- provider、model、voice、locale、speed、format、text hashを`audio_assets`へ記録する。
- 日本語voice、OSやbrowserの既定voice、locale未指定のfallbackをAPKG mediaとして採用しない。
- 音声生成に失敗した表現を無音または日本語発音のままpackageへ含めない。exportを再試行可能な失敗として返す。
- container formatはprovider/Anki互換性に応じて内部実装で決める。現行実装がWAVを使用しても、利用者向けUIには形式選択や個別生成操作を表示しない。
- filenameはASCII安全文字だけを使い、variant IDを含めて一意にする。
- packageに含めるmediaとfieldの`[sound:]`参照は1対1で対応し、missing mediaとunreferenced mediaを許容しない。

## 6. Package lifecycle

1. ownerがLISTSで表現を選び、EXPORTへ進む。
2. export serviceがDBのfields、tags、既存audio metadataを検証する。
3. 有効な`en-US` assetがなければ、WordとExample Sentenceの音声を内部生成してprivate storageへ保存する。
4. export serviceが音声media、note type、deck、tagsをAPKGへ同梱する。
5. packageをprivate storageへ保存する。
6. browserにはexport IDを返し、owner認証済みdownload routeから単一のAPKGを取得する。

同じvariantを編集して再exportした場合、同じGUIDと`Index`を使う。Ankiのempty profileへ初回importし、編集後の再importで重複せず更新できることをrelease gateとする。

## 7. API contract

- `POST /api/anki-exports`: `variantIds`またはLISTSと同等のfilter条件を受け取り、必要な音声生成とAPKG生成を行い、`{ export: { id, status, cardCount, filename } }`を返す。
- `GET /api/anki-exports/:id/download`: owner認証後、`.apkg`をdownloadする。
- TSV、CSV、個別WAVを返すexport endpointは定義しない。

## 8. Release gates

- 固定fixtureのWordとExample Sentenceについて、生成requestが`en-US`設定を持つことを自動テストする。
- 生成音声を人間が試聴し、米国英語発音であることを確認する。
- package内SQLite/ZIP、8 field、GUID、deck、tags、2 mediaと参照整合性を自動検証する。
- Anki Desktopの空profileへimportし、音声再生を確認する。
- 同じvariantを更新して再export・再importし、重複せず更新されることを確認する。
