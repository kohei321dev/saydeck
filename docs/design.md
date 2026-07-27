# SayDeck 設計

- Status: Accepted
- Date: 2026-07-27
- Requirements: `docs/requirements.md`
- Anki contract: `docs/specifications/anki-export.md`
- Decision: `docs/adr/0016-situation-first-expression-and-anki-contract.md`

## 1. Architecture

```text
INPUT
  inputJa + optional preferred primary ID
  → POST /api/expressions
  → active primary list + inputJa → AI structured generation
  → REVIEW in browser
  → PATCH /api/expressions/:id
  → situation + sequence + selected variants committed atomically

LISTS
  registered entries + situation joins
  → client filter / edit / archive / export selection

EXPORT
  selected variant IDs
  → expression en-US TTS
  → 5-field Anki projection
  → private APKG storage
  → authenticated download
```

Next.js App RouterのServer Componentsが初期データを読み、対話部分だけClient Componentsへ渡す。DB、AI、TTS、private storageはRoute Handlerまたはserver moduleからだけ利用する。

## 2. UI boundaries

| Route | Responsibility |
| --- | --- |
| `/input` | 日本語入力、既存主の任意優先、AI生成、分類・候補確認、登録 |
| `/lists` | 登録済みentryの絞り込み、英文・和訳編集、論理削除、export選択 |
| `/export` | 選択確認、音声・APKG生成、download |

`/api/situations`はownerのactiveな主・副分類を返す。分類専用管理画面は持たない。

## 3. Database

### Current expression domain

| Table | Responsibility | Important constraints |
| --- | --- | --- |
| `generation_profiles` | semantic expression layer rules | codeは`basic/detail/conversation/natural_alternative`。`basic`は1文・原則12語以内・発話行為1つ |
| `expression_entries` | 日本語入力と登録状態 | registered時に`situation_sequence`必須 |
| `sentence_cards` | 入力を分けた意味単位 | owner・entry・position unique |
| `sentence_variants` | 意味単位ごとの英文・和訳 | card・profile unique、GUID unique、owner・Index unique |
| `situation_definitions` | owner別の主・副分類master | 主key unique、副はparent・label unique |
| `expression_entry_situations` | entryへの主・副割当 | entry・role primary key、同じsituationの重複禁止 |
| `situation_sequence_counters` | 主分類内の入力連番 | owner・primary ID primary key |
| `audio_assets` | variantごとのExpression音声metadata | owner・variant unique |
| `anki_exports` | APKG artifact状態 | owner scope、private path |

### Situation invariants

- `primary`: `parent_id is null`
- `secondary`: `parent_id is not null`
- application transactionは副のparentが選択主と一致し、両分類のownerがentry ownerと一致することを検証する。
- 新規主は正規化labelのstable hashからcanonical keyを作る。ASCII labelを含む場合は可読slugを使う。
- 副の完全重複はtransaction-scoped advisory lockで直列化し、未使用最小の`duplicate_sequence`を割り当てる。
- 主分類内連番はcounter tableのatomic upsertで採番する。

### Variant identity

- `anki_guid`: variant作成時に一度生成するAnki note GUID。
- `anki_index`: 登録時に`primary canonical key + situation sequence + meaning position + layer ordinal`から作り、以後変更しない。
- 画面上の短い番号は`situation_sequence`と`sentence_cards.position`から`001-01`のように表示する。
- AIはGUID、Index、suffix、sequenceを生成しない。

## 4. AI generation contract

AI input:

- `inputJa`
- activeな主分類の`id`, `labelJa`, `canonicalKey`
- 任意のpreferred primary ID
- semantic generation profile definitions
- 再生成時だけ固定した意味単位

AI output:

```ts
{
  primarySituationId: string | null
  primaryLabelJa: string
  secondaryBaseLabelJa: string
  segments: Array<{
    intentJa: string
    variants: Array<{
      profileCode: "basic" | "detail" | "conversation" | "natural_alternative"
      expressionEn: string
      translationJa: string
    }>
  }>
}
```

server validation:

- segmentは1〜8件。
- 各segmentに`basic`が1件必須。
- `basic`は難易度順の最下層ではなく、最小・標準・単独で使える1発話とする。条件・仮定・理由・時刻や数量・追加依頼・間接依頼を含めず、原則1文・12語以内に収める。
- それらの情報が必要な場合は、独立して復習できる意味単位へ分けるか、任意の`detail`へ置く。`conversation`は口語性のレイヤーであり、`basic`より短い、または易しい場合がある。
- 同じprofile codeの重複禁止。
- 任意profileは欠けてよい。
- existing primary IDは実際に渡した一覧内だけ許可する。
- primary labelとsecondary base labelは空不可、120文字以内。
- ExpressionとTranslationは空不可、2,000文字以内。

AIの分類提案はgeneration responseとしてREVIEWへ返し、分類masterは変更しない。ユーザーのPATCH確定時だけ分類を永続化する。

## 5. Store transaction

初回登録の`approveExpressionEntry`は1 transaction内で次を行う。

1. entryを`for update`でlockする。
2. selected variantがentryに属することを検証する。
3. 各意味単位の`basic`選択を検証する。
4. 英文・和訳の修正を保存し、英文変更時は音声をstaleにする。
5. 既存主を検証または新規主を作成する。
6. 副を作成し、完全一致なら3桁suffixを採番する。
7. 主・副assignmentを保存する。
8. 主分類内`situation_sequence`を採番する。
9. 全variantの恒久`anki_index`を確定する。
10. selected状態とentryのregistered状態を保存する。

登録済みentryのPATCHでは分類とsequenceを変更せず、英文・和訳・選択状態だけを更新する。

## 6. Audio

`registerSentenceVariantAudio`はvariantの`expression_en`を読む音声1件だけを扱う。

- provider: xAI Text to Speech
- request language: `en`
- stored locale: `en-US`
- format: WAV / 24kHz
- hash input: text、model、voice、locale、speed、format
- valid cache: provider・locale・hashが一致する`ready` asset

browser speechへのfallbackはない。Productionではprivate Blob、developmentでは`.saydeck-storage`を利用できる。

## 7. Anki projection

DBから次へ投影する。

```text
sentence_variants.anki_index → Index
primary/secondary/layer labels → Context
sentence_variants.expression_en → Expression
sentence_variants.translation_ja → Translation
audio_assets → expression_audio
```

Deck:

```text
SayDeck::主シチュエーション::副シチュエーション::表現レイヤー
```

Tags:

```text
source::saydeck
primary_situation::<primary canonical key>
secondary_situation::<primary canonical key>::<secondary canonical key>
layer::<profile code>
```

詳細は`docs/specifications/anki-export.md`を正本とする。

## 8. Error and security boundaries

- 認証なし: `401`
- DB未設定: `503`
- AI/TTS未設定: `503`
- AI/TTS quota: `429`
- invalid AI structure: `502`
- classification/basic不足: `400`
- audio未準備: `409`またはexport準備失敗
- storage未設定: Productionでは`503`

全queryで`owner_login`を検証する。API key、DB URL、storage token、raw provider responseをclientやlogへ返さない。

## 9. Migration and compatibility

`0008-situation-first-expression-contract.sql`はSayDeck expression domainをtruncateし、旧分類列、L1〜L4、旧カード本文列、2音声構造を置き換える。`0009-refine-expression-layer-definitions.sql`は既存の`generation_profiles`を、basicが1文・原則12語以内となる定義へ更新するだけで、保存済みvariantは書き換えない。新アプリとmigrationは同じrelease単位で切り替える。

旧practice系tableとmigrationは保持するが、現行UI・API・exportから参照しない。旧Anki note typeとの互換投影は行わない。

## 10. Verification

- static: lint、typecheck、production build、WASM trace
- DB: migration適用、schema probe、transaction採番、suffix、owner isolation
- browser: INPUT → REVIEW → LISTS → EXPORTの画面とAPI境界
- audio: 実生成したfixtureを人間が米国英語として試聴
- Anki: 空profileへのimport、deck、5 fields、Context、front-only audio、再import
