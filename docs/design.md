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
| `/settings` | ownerのAI provider確認、接続probe、provider切替 |

`/api/situations`はownerのactiveな主・副分類を返す。分類専用管理画面は持たない。

## 3. Database

### Current expression domain

| Table | Responsibility | Important constraints |
| --- | --- | --- |
| `generation_profiles` | semantic expression layer rules | codeは`standard/native/pattern`。`standard`は1文・原則18語以内・発話行為1つ。`pattern`は03a〜03cを使う |
| `expression_entries` | 日本語入力と登録状態 | registered時に`situation_sequence`必須 |
| `sentence_cards` | 入力を分けた意味単位 | owner・entry・position unique |
| `sentence_variants` | 意味単位ごとの英文・和訳 | card・profile・pattern unique、GUID unique、owner・Index unique |
| `situation_definitions` | owner別の主・副分類master | 主key unique、副はparent・label unique |
| `expression_entry_situations` | entryへの主・副割当 | entry・role primary key、同じsituationの重複禁止 |
| `situation_sequence_counters` | 主分類内の入力連番 | owner・primary ID primary key |
| `audio_assets` | variantごとのExpression音声metadata | owner・variant unique |
| `anki_exports` | APKG artifact状態 | owner scope、private path |
| `owner_ai_settings` | ownerごとの生成provider選択 | owner primary key、providerは`xai/sakana` |

`sentence_cards`は生成時の`generation_provider`と`generation_model`を持つ。provider変更後も保存済みカードの値は変更しない。

### Situation invariants

- `primary`: `parent_id is null`
- `secondary`: `parent_id is not null`
- application transactionは副のparentが選択主と一致し、両分類のownerがentry ownerと一致することを検証する。
- 新規主は正規化labelのstable hashからcanonical keyを作る。ASCII labelを含む場合は可読slugを使う。
- 副の完全重複はtransaction-scoped advisory lockで直列化し、未使用最小の`duplicate_sequence`を割り当てる。
- 主分類内連番はcounter tableのatomic upsertで採番する。

### Variant identity

- `anki_guid`: variant作成時に一度生成するAnki note GUID。
- `anki_index`: 登録時に`primary canonical key + situation sequence + meaning position + layer ordinal + expression pattern ordinal`から作り、以後変更しない。
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
    standard: {
      profileCode: "standard"
      patternCode: "default"
      expressionEn: string
      translationJa: string
    }
    alternatives: Array<{
      target: "native" | "pattern_a" | "pattern_b" | "pattern_c"
      applicable: boolean
      reasonJa: string
      expressionEn: string | null
      translationJa: string | null
    }>
  }>
}
```

server validation:

- xAIとSakana AIはResponses APIの`text.format.type=json_schema`を使う。xAIには全制約を含むschemaを渡し、Sakanaにはproviderが受理できる構造・必須field・基本型のstrict schemaを渡す。件数、長さ、固定値、target順、nullable整合を含む同じserver-side正規化処理を必ず通し、不正responseは保存しない。
- segmentは1〜8件。
- 各segmentに`standard`が1件必須。
- `standard`は必要な詳細を含み、その場で単独利用できる1発話とする。原則1文・18語以内に収め、独立した複数の内容はsegmentへ分ける。
- alternativesは4対象を重複なく必ず評価する。`applicable=true`なら英文・和訳必須、falseなら両方nullとする。
- `native`は各segmentで1件まで。`pattern`はpatternCode a〜cごとに1件まで。
- `pattern`は適用可能なものだけvariantへ変換し、03a〜03cの数合わせを禁止する。すべて完成英文とし、解説や語句断片を返さない。
- 4対象がすべてfalseのsegmentがあれば、意味単位と初回standardを固定して1回だけ再評価し、追加候補だけを初回結果へmergeする。
- 評価理由はgeneration responseの検証用でありDBには保存しない。
- existing primary IDは実際に渡した一覧内だけ許可する。
- primary labelとsecondary base labelは空不可、120文字以内。
- ExpressionとTranslationは空不可、2,000文字以内。

AIの分類提案はgeneration responseとしてREVIEWへ返し、分類masterは変更しない。ユーザーのPATCH確定時だけ分類を永続化する。

Grok 4.3のreasoning effortは`OWNER_AI_EFFORT`で`low`、`medium`、`high`を選べる。未設定・不正値・旧`none`値は品質下限として`medium`へ正規化する。Sakana AIは`SAKANA_AI_EFFORT`で対応modelが許可するeffortを選び、既定値を`high`とする。03cはモデルの米国英語知識に基づくコロケーション判定であり、MVPでは外部コーパスを検索しない。

### Provider selection

`GET /api/settings/ai`は選択中providerと各providerのmodel・設定有無を返す。`PATCH /api/settings/ai`は設定済みproviderだけを`owner_ai_settings`へupsertする。`POST /api/settings/ai/probe`は明示的に選んだproviderへ短い接続確認を行うが、選択状態を変更しない。

Slackでは既存`/saydeck` commandのtextをsubcommandとして解釈する。

```text
/saydeck model        → 現在のprovider/modelと設定状態
/saydeck modelchange  → xAI／Sakana AIの選択button
/saydeck <日本語>     → 選択中providerで通常生成
```

Browser APIとSlack actionは共通のprovider setting serviceを呼ぶ。API keyはenvからだけ読み、DBとresponseへ保存しない。選択providerが失敗した場合はそのproviderの失敗として返し、silent fallbackしない。

## 5. Store transaction

初回登録の`approveExpressionEntry`は1 transaction内で次を行う。

1. entryを`for update`でlockする。
2. selected variantがentryに属することを検証する。
3. 各意味単位の`standard`選択を検証する。
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
expression_pattern::<a-c>  (patternのみ)
```

詳細は`docs/specifications/anki-export.md`を正本とする。

## 8. Error and security boundaries

- 認証なし: `401`
- DB未設定: `503`
- AI/TTS未設定: `503`
- AI/TTS quota: `429`
- invalid AI structure: `502`
- classification/standard不足: `400`
- audio未準備: `409`またはexport準備失敗
- storage未設定: Productionでは`503`

全queryで`owner_login`を検証する。API key、DB URL、storage token、raw provider responseをclientやlogへ返さない。

## 9. Migration and compatibility

`0008-situation-first-expression-contract.sql`はSayDeck expression domainをtruncateし、旧分類列、L1〜L4、旧カード本文列、2音声構造を置き換える。`0010-detail-expression-patterns.sql`でpattern_codeを追加し、`0011-three-layer-expression-model.sql`で現行のstandard/native/patternへ移行する。0011は互換性のある旧variantを移し、意味が変わる旧variantを削除せずarchivedにする。`0012-remove-legacy-learning-tables.sql`は廃止済みのアプリ内学習4テーブルと旧generation profile行を物理削除する。新アプリとmigrationは同じrelease単位で切り替える。

## Slack／Discord capture境界

Slack／DiscordはブラウザAPIの代替認証ではなく、署名付きWebhookから既存のexpression domain serviceを呼ぶ追加入力経路とする。Slackはメンション・DM・`/saydeck`、DiscordはHTTP Interactionの`/saydeck`をMVP対象とする。

- platform署名検証とimmutable user ID allowlistを両方通過した操作だけを`GITHUB_OWNER`へserver-side mappingする。
- client payload、表示名、メールアドレスから`owner_login`を決定しない。
- AI生成結果は`generated`のままプレビューし、ownerの`登録`操作で初めて`registered`へ遷移する。
- `chat_card_requests`の一意なsource eventと状態claimでWebhook再送・ボタン連打を冪等化する。
- Slackの応答は元メッセージまたはslash受付メッセージのthreadへ返す。
- chat経由で承認したカードも既存LISTS／EXPORT／Anki note契約をそのまま利用する。

`0013-chat-card-approval.sql`はこの承認状態を追加する。`0014-owner-ai-provider-selection.sql`はowner provider設定とカード生成元metadataを追加し、既存カードを`xai`／`grok-4.3`へbackfillする。Chat SDKのPostgres state tableは配送・lock用であり、業務状態の正本にはしない。

旧practice系tableとmigrationは保持するが、現行UI・API・exportから参照しない。旧Anki note typeとの互換投影は行わない。

## 10. Verification

- static: lint、typecheck、production build、WASM trace
- DB: migration適用、schema probe、transaction採番、suffix、owner isolation
- browser: INPUT → REVIEW → LISTS → EXPORTの画面とAPI境界
- audio: 実生成したfixtureを人間が米国英語として試聴
- Anki: 空profileへのimport、deck、5 fields、Context、front-only audio、再import
