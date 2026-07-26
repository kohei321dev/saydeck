# Anki Export Specification

- Status: Accepted
- Date: 2026-07-27
- Scope: SayDeckが生成する米国英語音声同梱`.apkg`

正式なexport形式はAPKGだけとする。TSV、CSV、個別WAV downloadは提供しない。

## 1. Note and card

- Note type: `SayDeck`
- Card template: `SayDeck Expression`
- 1 noteにつき1 card
- Front: `Context`、`Expression`、`expression_audio`
- Back: `Context`、`Translation`
- Backに`FrontSide`を埋め込まず、音声を表示・再生しない

旧`SayDeck ES1Kv2`の8フィールド契約とは別note typeとして扱う。

## 2. Field contract

| Ordinal | Field | Source | Required |
| --- | --- | --- | --- |
| 1 | `Index` | DBの`sentence_variants.anki_index` | Yes |
| 2 | `Context` | 主・副・表現レイヤーからexport時生成 | Yes |
| 3 | `Expression` | `sentence_variants.expression_en` | Yes |
| 4 | `Translation` | `sentence_variants.translation_ja` | Yes |
| 5 | `expression_audio` | `[sound:saydeck_expression_<variant-id>.wav]` | Yes |

`Context`の形式:

```text
主: 友人への返信 / 副: 久しぶりの連絡 / 表現: 01_基本表現
```

AI由来の文字列はHTML escapeする。`expression_audio`だけがsystem生成の`[sound:]`記法を持つ。

## 3. Deck

```text
SayDeck
└── <主シチュエーション>
    └── <副シチュエーション>
        └── <表現レイヤー>
```

例:

```text
SayDeck::友人への返信::久しぶりの連絡::01_基本表現
```

表現レイヤーは次の表示名を使う。

- `basic` → `01_基本表現`
- `detail` → `02_詳細表現`
- `conversation` → `03_会話表現`
- `natural_alternative` → `04_別の自然な言い方`

任意variantが存在しない場合、そのdeckも作られない。1 noteを複数deckへ複製しない。deck segment内の`::`と制御文字は安全な文字へ置換する。

## 4. Tags

```text
source::saydeck
primary_situation::<primary-canonical-key>
secondary_situation::<primary-canonical-key>::<secondary-canonical-key>
layer::<profile-code>
```

ジャンルtag、難易度tag、旧`situation::<tag>`は出力しない。

## 5. IDs and reimport

- `anki_guid`はvariant生成時に一度だけ作り、同一variantの全exportで再利用する。
- `Index`はDB保存済みの`anki_index`をそのまま投影し、export時にvariant IDから再計算しない。
- `anki_index`は主canonical key、主分類内入力連番、意味単位位置、表現レイヤーordinalを含む。
- model IDは新しい`SayDeck` note type専用の固定値。
- deck IDはdeck名から決定的に計算する。
- 同一variantの再importは重複カード作成ではなく更新になることを空profileで確認する。

## 6. Media

- Pronunciation target: American English
- request language: `en`
- asset locale metadata: `en-US`
- 読み上げる本文: `Expression`全文
- variantにつき音声1件
- filename: `saydeck_expression_<safe-variant-id>.wav`

provider、model、voice、locale、speed、format、text hashを`audio_assets`へ保存する。日本語voice、browser speech、OS既定voiceへfallbackしない。

APKGへ含める前に、音声field参照とmedia fileが1対1で存在することを検証する。readyなen-US assetがない場合は内部生成し、失敗した場合はpackage作成を中止する。

## 7. Package lifecycle

1. LISTSでvariantを選び、EXPORTへ進む。
2. `POST /api/anki-exports`がowner・entry・variant・分類を検証する。
3. Expressionのreadyなen-US音声を再利用または生成する。
4. 5 fields、deck、tags、GUID、音声をAPKGへ同梱する。
5. APKGをprivate storageへ保存する。
6. export IDを返す。
7. owner認証済み`GET /api/anki-exports/:id/download`でdownloadする。

## 8. Release gates

- APKG内部のnote type名とfield順が本仕様と一致する。
- `Context`がFront/Backの上部に表示される。
- FrontでExpressionとen-US音声を確認できる。
- BackはTranslationだけで音声がない。
- Deckが`SayDeck::主::副::表現レイヤー`になる。
- `source`、主、副、layer tagsが存在する。
- `Index`がDB値と一致し、GUIDも再exportで不変。
- 同一variantの再importで重複しない。
- 実音声を人間が試聴し、米国英語であることを確認する。
