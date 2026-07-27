# SayDeck 要求定義

- Status: Accepted
- Date: 2026-07-27
- Related: `docs/product-brief.md`, `docs/design.md`, `docs/specifications/anki-export.md`, `docs/adr/0016-situation-first-expression-and-anki-contract.md`

## 1. 目的

日本語の`言いたいこと`を受け取り、実際の場面で使える英語表現へ変換し、Ankiで復習できる形式で蓄積・出力する。

主要機能は次の2つに限定する。

1. AIで英語表現を生成し、主・副シチュエーションで整理してDBへ保存する。
2. 選択した表現を米国英語音声付きAPKGとして出力する。

UIはこの責務を`INPUT`、`LISTS`、`EXPORT`の3画面で表現する。

## 2. 対象ユーザー

- Primary user: owner本人
- Primary device: iOSブラウザ、必要に応じてdesktop browser
- 利用場面: 移動中、会話後、スケートボード中など、表現を思いついた直後
- 共有、共同編集、公開deckはMVP対象外

## 3. 画面

| Screen | Route | Responsibility |
| --- | --- | --- |
| `INPUT` | `/input` | 日本語入力、AI生成、主・副分類と候補の確認、保存 |
| `LISTS` | `/lists` | 一覧、検索、分類・日付filter、英文・和訳編集、削除、export選択 |
| `EXPORT` | `/export` | 対象確認、en-US音声・APKG生成、download |

`/`は`/input`へ遷移する。学習、添削、練習履歴、TSV、個別音声生成の導線を表示しない。

## 4. 機能要件

### FR-1: INPUT

- 必須入力は1〜2,000文字の日本語`言いたいこと`。
- 登録済み主シチュエーションを任意で優先できる。未選択ならAIが判断する。
- 送信前に日本語入力と優先主IDをlocalStorageへ一時退避し、DB保存成功後に消す。
- DB・通信・AI失敗時は入力を保持し、同じentryで生成を再試行できる。
- ジャンル入力は存在しない。

### FR-2: 主・副シチュエーション

- 主シチュエーションは広い場面、副シチュエーションは今回の目的・文脈を表す。
- APIはownerのactiveな主分類一覧（ID、表示名、canonical key）をAIへ渡す。
- AIは既存主に該当する場合だけそのIDを返し、該当しない場合は新規主の日本語名を返す。
- 新規主はユーザーが保存を確定した時だけ作成する。
- 副は1件必須。選択した主の配下へ新規作成する。
- 同じ主の配下に副の基底名が完全一致する場合、最小未使用の`-001`、`-002`…を末尾へ付ける。意味的な類似だけでは統合しない。
- 主・副はentryごとに各1件とし、登録後の分類変更はMVPで提供しない。

### FR-3: 意味単位と表現レイヤー

- 1つの日本語入力で意図を表すために複数の独立した英文が必要な場合、AIは最大8件の意味単位へ分割する。
- 各意味単位は次のvariantを持つ。

| Code | Display | Required | Generation rule |
| --- | --- | --- | --- |
| `basic` | `01_基本表現` | Yes | 1文・原則12語以内・発話行為1つ。標準的な語順で最小限を伝え、条件・理由・数量・追加依頼・間接依頼は含めない |
| `detail` | `02_詳細表現` | No | 基本表現を土台に、1文・18語以内で適用可能な02a〜02eの文法・語句展開を生成。単なる長文化や置換は不可 |
| `conversation` | `03_会話表現` | No | 口語、省略、くだけた言い回しなど明確に異なる会話表現だけ。短くてもよく、`basic`より難しいことは要件にしない |
| `natural_alternative` | `04_ネイティブ表現` | No | ネイティブ話者が使う自然な定型句・省略・別構文だけ |

`detail`のpattern_codeは次の5種類です。`a` 形容詞・補語、`b` 副詞・程度、`c` 前置詞句、`d` 熟語・定型結合、`e` 文法展開。入力に適用できるパターンだけ返し、最大5件とします。

- 任意レイヤーに実用上の差がなければ生成しない。数合わせの類似文を禁止する。
- `detail`は意味単位ごとに`pattern_code`（`a`〜`e`）で識別し、適用可能なパターンだけ複数保持する。
- 各variantは`expressionEn`と`translationJa`だけを本文正本として持つ。基本ワードと例文を分離しない。
- `anki_guid`と仮Indexはシステムがvariant作成時に生成する。

### FR-4: REVIEWと登録

- ユーザーはAI提案後に主1件、副1件、英文候補を確認する。
- `basic`は各意味単位で必須選択とし、画面から解除できない。
- `basic`は難易度の最下層ではなく、最小・標準・単独で使える表現レイヤーである。複数の発話行為が必要な日本語入力は意味単位へ分ける。
- 例として、`I'm running late.`、`Please go in first.`、`Tell the restaurant we'll be late.`は`basic`とする。一方、`If it looks like we'll miss the reservation, could you let the restaurant know we'll be a bit late?`は`detail`とする。
- 保存transaction内で主・副作成、entryとの対応、主分類内連番、選択状態、登録日時を確定する。
- `situation_sequence`はowner・主シチュエーションごとの入力連番とする。
- 表示上の意味単位番号は`001-01`形式とし、999を超えたら`1000-01`へ自然に拡張する。
- `anki_index`は主分類のcanonical key、入力連番、意味単位位置、表現レイヤー、detail patternを含む一意な恒久値とする。

### FR-5: LISTS

- 登録済みentryを一覧表示する。
- 主シチュエーション、副シチュエーション、表現レイヤー、登録日、キーワードを組み合わせて絞り込める。
- キーワードは日本語入力、分類名、英文、和訳を検索対象とする。
- 英文・和訳を編集できる。英文変更時は対応音声を`stale`にする。
- entryは論理削除でき、子データと過去export参照を保全する。
- variantを個別・一括選択し、sessionStorageでEXPORTへ引き継ぐ。

### FR-6: 米国英語音声

- variantごとに`Expression`全文を読む音声を1件だけ持つ。
- TTS requestはlanguage `en`、locale metadata `en-US`、model、voice、speed、WAV formatをserver側で固定する。
- 日本語voice、OS・browser既定voice、locale未指定fallbackをAPKGへ含めない。
- 本文とTTS設定のhashが一致するready assetだけを再利用する。
- 音声生成に失敗したvariantを無音でpackageへ含めず、再試行可能なexport失敗とする。

### FR-7: APKG

- Note typeは`SayDeck`、1 noteにつき1 card。
- field順は`Index`, `Context`, `Expression`, `Translation`, `expression_audio`の5件。
- `Context`はexport時に主・副・表現レイヤーから生成し、DBへ重複保存しない。
- FrontはContext、Expression、en-US音声。BackはContextとTranslationだけで音声を置かない。
- Deckは`SayDeck::主シチュエーション::副シチュエーション::表現レイヤー`。
- Tagsは`source`、`primary_situation`、`secondary_situation`、`layer`。ジャンルtagは出力しない。
- DBの`anki_guid`と`anki_index`を再exportでも再利用する。
- 正式出力はAPKGだけ。TSV、CSV、個別WAV endpointを提供しない。

## 5. 非機能要件

- Neon/Postgresを構造化データの正本とする。
- 音声binaryとAPKGはprivate object storageへ保存し、DBにはpathとmetadataだけを持つ。
- API key、connection string、Blob token、raw AI response、署名URLをlogへ出さない。
- 主要操作はiOS縦画面で横スクロールせず実行できる。
- 主・副分類作成、連番、副suffix採番をtransactionとDB unique制約で保護する。
- owner scopeを全query・mutationで検証する。

## 6. 非対象

- アプリ内学習、英作文添削、採点、復習キュー
- 分類マスタ専用管理画面
- 初回export後の分類変更とAnki deck自動移動
- TSV、CSV、個別WAV、日本語TTS、発音採点
- AnkiConnectやAnkiWebへの直接同期
- 共有、共同編集、公開deck

## 7. Migration

`0008-situation-first-expression-contract.sql`で既存SayDeck表現・音声metadata・APKG履歴を削除し、次を物理的に廃止する。

- `genre_slug`, `situation_ja`, `situation_tags`
- L1〜L4 profile code
- 基本ワード・例文用の旧variant列
- `word`/`sentence`の2音声構造

旧practice系テーブルとmigrationは履歴・復旧用に保持し、現行UIから参照しない。

## 8. Release gates

- `lint`、`typecheck`、production `build`が成功する。
- Fixture 001〜003で主分類内連番、複数意味単位、任意レイヤー省略を確認する。
- 同じ副基底名の2回目が`-001`になる。
- 生成音声を人間が試聴し、米国英語であることを確認する。
- 空のAnki profileで初回import、Context、deck階層、表面音声、裏面無音を確認する。
- 同一variantを再export・再importし、重複しないことを確認する。
