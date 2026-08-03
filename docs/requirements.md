# SayDeck 要求定義

- Status: Accepted
- Date: 2026-07-27
- Related: `docs/product-brief.md`, `docs/design.md`, `docs/specifications/anki-export.md`, `docs/adr/0016-situation-first-expression-and-anki-contract.md`

## 1. 目的

日本語の`言いたいこと`を受け取り、実際の場面で使える英語表現へ変換し、Ankiで復習できる形式で蓄積・出力する。

主要機能は次の2つに限定する。

1. AIで英語表現を生成し、主・副シチュエーションで整理してDBへ保存する。
2. 選択した表現を米国英語音声付きAPKGとして出力する。

UIはこの責務を`INPUT`、`LISTS`、`EXPORT`の3主要画面で表現し、owner専用の`SETTINGS`でAI providerを管理する。

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
| `SETTINGS` | `/settings` | 選択中AI provider/model、credential設定状態、接続確認、provider切替 |

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
| `standard` | `01_標準表現` | Yes | 1文・原則18語以内・発話行為1つ。入力の意図に必要な詳細を含め、その場で使える標準的な英文にする |
| `native` | `02_ネイティブ・口語表現` | No | 01と同じ意図を、会話で使われる省略・定型句・自然な語順で表す。明確な差がある場合だけ1件 |
| `pattern` | `03_表現パターン` | No | 01を土台に、03a〜03cの学習パターンを使った完成英文を生成。解説や語句断片だけのカードは禁止 |

`pattern`のpattern_codeは次の3種類です。`a` 文法展開、`b` 熟語・句動詞、`c` コロケーション。03cはモデルの米国英語知識に基づく一般的な語の組み合わせを扱い、MVPでは外部コーパス検索を行いません。入力に適用できるパターンだけ最大3件返します。

- 任意レイヤーのカード作成は任意だが、AIは意味単位ごとに`native`、`pattern_a`、`pattern_b`、`pattern_c`を必ず評価する。
- 各評価は`applicable`と日本語の理由を返し、`applicable=true`の場合だけ完成英文と和訳を返す。falseの場合は本文を返さない。
- 4対象がすべてfalseでstandardしか得られなかった意味単位は、意味単位・standardを固定したまま1度だけ再評価する。
- 任意レイヤーに実用上の差がなければ生成しない。数合わせの類似文を禁止する。
- `pattern`は意味単位ごとに`pattern_code`（`a`〜`c`）で識別し、適用可能なパターンだけ複数保持する。
- 各variantは`expressionEn`と`translationJa`だけを本文正本として持つ。基本ワードと例文を分離しない。
- `anki_guid`と仮Indexはシステムがvariant作成時に生成する。
- AI responseはJSON SchemaによるStructured Outputsで受け、評価理由は生成時の検証にのみ使いDBへ永続化しない。

### FR-4: REVIEWと登録

- ユーザーはAI提案後に主1件、副1件、英文候補を確認する。
- `standard`は各意味単位で必須選択とし、画面から解除できない。
- `standard`は、必要な詳細を含む標準的で単独利用できる表現レイヤーである。複数の発話行為が必要な日本語入力は意味単位へ分ける。
- 保存transaction内で主・副作成、entryとの対応、主分類内連番、選択状態、登録日時を確定する。
- `situation_sequence`はowner・主シチュエーションごとの入力連番とする。
- 表示上の意味単位番号は`001-01`形式とし、999を超えたら`1000-01`へ自然に拡張する。
- `anki_index`は主分類のcanonical key、入力連番、意味単位位置、表現レイヤー、expression patternを含む一意な恒久値とする。

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

### FR-8: Slack／Discord入力

- GitHub owner向けブラウザ機能に加え、同じownerだけがSlack／Discordから日本語入力と登録承認を実行できる。
- Slackはメンション、DM、`/saydeck`を受け付け、チャンネル内の結果はthreadへ返す。
- DiscordはMVPでHTTP Interactionの`/saydeck`と承認ボタンを受け付ける。常時接続Gatewayは利用しない。
- AI生成時点ではLISTSへ登録せず、ownerが候補カードの`登録`を押した時だけ全候補を既存expression domainへ登録する。`破棄`では下書きをarchiveする。
- platform署名とimmutable user ID allowlistを別々に検証し、両方を通過した場合だけserver側で`GITHUB_OWNER`へ対応付ける。
- Webhook再送と承認ボタン連打は、source eventの一意制約と承認状態claimにより二重登録させない。
- Slack／Discordの会話履歴をカードの正本にせず、承認済みデータはNeonへ保存する。

### FR-9: AI provider設定と生成元

- ownerは`xai`と`sakana`から生成providerを1つ選択できる。
- Browserの`/settings`とSlackの`/saydeck model`は同じ選択状態を表示する。
- Slackの`/saydeck modelchange`は設定済みproviderをbuttonで選択し、owner本人だけが変更できる。
- API key本体は環境変数だけに保存し、画面、Slack、API response、DB、logへ返さない。
- 画面とSlackにはprovider名、model ID、credential設定有無、明示的に実行した接続確認結果だけを表示する。
- 未設定providerへの切替を拒否し、provider障害時に別providerへ自動fallbackしない。
- provider選択はowner単位でNeonへ保存し、BrowserとSlackからの次回生成に共通適用する。未保存時は後方互換として`xai`を使用する。
- 生成開始時のprovider/modelをgeneration中は固定し、再評価も同じprovider/modelを使う。
- 新規`sentence_cards`へ`generation_provider`と`generation_model`を保存し、LISTSで確認できる。
- 既存カードは従来の固定構成に基づき`xai`／`grok-4.3`として移行する。
- 生成元metadataはMVPではAnkiの5-field、deck、tagへ追加しない。

## 5. 非機能要件

- Neon/Postgresを構造化データの正本とする。
- 音声binaryとAPKGはprivate object storageへ保存し、DBにはpathとmetadataだけを持つ。
- API key、connection string、Blob token、raw AI response、署名URLをlogへ出さない。
- provider設定APIと接続確認APIはowner認証で保護し、credentialの値・一部・長さをclientへ返さない。
- 主要操作はiOS縦画面で横スクロールせず実行できる。
- 主・副分類作成、連番、副suffix採番をtransactionとDB unique制約で保護する。
- owner scopeを全query・mutationで検証する。
- Slack signing secret、Discord public keyでWebhookを検証し、platform user IDとworkspace／guild IDをserver-side allowlistで照合する。

## 6. 非対象

- アプリ内学習、英作文添削、採点、復習キュー
- 分類マスタ専用管理画面
- 初回export後の分類変更とAnki deck自動移動
- TSV、CSV、個別WAV、日本語TTS、発音採点
- AnkiConnectやAnkiWebへの直接同期
- 共有、共同編集、公開deck
- Discordの通常メッセージ監視・常時接続Gateway

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
- Slack／Discordでownerだけが候補を生成・承認でき、Webhook再送とボタン連打で登録が重複しないことを確認する。
- BrowserとSlackでproviderを切り替えると双方へ同じ選択が表示され、次に生成したカードだけへ選択したprovider/modelが記録されることを確認する。
- xAIとSakana AIの実接続確認が個別に行え、片方の失敗時に自動fallbackしないことを確認する。
