# ADR 0017: ownerが切り替えるAI providerと生成元provenance

- Status: Accepted
- Date: 2026-08-03

## Context

SayDeckの英文生成はxAI Responses APIと`OWNER_AI_KEY`へ固定されている。ownerはSakana AIのsubscription API keyも利用でき、同じ入力と生成契約をxAIとSakana AIで比較したい。

切替はブラウザとSlackの両方から行う必要がある。また、後から生成品質を比較できるように、保存された意味単位カードがどのprovider/modelで生成されたかを失わない必要がある。

API keyそのものをDBやclientへ出すと漏えいリスクになる。環境変数の有無と接続状態、選択中providerだけを表示対象にする。

## Decision

### Provider

MVPで次の2 providerを許可する。

| Code | Service | Default model | Credential |
|---|---|---|---|
| `xai` | xAI | `grok-4.3` | `OWNER_AI_KEY` |
| `sakana` | Sakana AI API | `fugu` | `SAKANA_API_KEY` |

xAI modelは`OWNER_AI_MODEL`、Sakana modelは`SAKANA_AI_MODEL`でserver-side設定できる。許可済みmodel以外は利用時に拒否する。Sakanaのreasoning effortは`SAKANA_AI_EFFORT`で設定し、初期値を`high`とする。

Sakana AIはOpenAI互換のResponses APIを`https://api.sakana.ai/v1/responses`で提供する。2026-08-03の実APIではResponses endpointのStructured Outputsは`response_format`ではなく`text.format`を要求した。SayDeckはproviderごとのschema能力差をadapterで吸収し、正規化後は同じ`GenerationResult`検証を必ず通す。

### Selection

`owner_ai_settings`にownerごとの`active_provider`を1件保存する。行がない場合は後方互換のため`xai`を選択中として扱う。

- Browser: owner認証後の`/settings`で現在値、model、credential設定有無、接続結果を確認し、providerを切り替える。
- Slack: `/saydeck model`で現在値を確認し、`/saydeck modelchange`で選択ボタンを表示する。
- Slack buttonとBrowser APIは同じserver-side serviceを呼ぶ。
- 未設定providerへの切替は拒否する。
- 一時的な接続失敗を理由に設定値を自動変更しない。

選択したproviderが失敗しても、別providerへ自動fallbackしない。silent fallbackは比較、課金判断、生成元provenanceを不正確にするためである。

### Credential visibility

API keyは環境変数だけに保存する。Browser、Slack、API response、DB、application logでは次だけを扱う。

- provider codeと表示名
- model ID
- credentialが設定済みか
- probe結果とHTTP status

key本体、prefix、末尾文字、長さは返さない。

### Generation provenance

生成開始時に選択中provider/modelを解決し、そのgeneration全体と再評価で固定する。生成された各`sentence_cards`へ次をsnapshot保存する。

- `generation_provider`
- `generation_model`

LISTSではカード属性として表示する。既存カードは、これまでxAI固定だった履歴に基づき`xai`／`grok-4.3`へbackfillする。

Ankiの5-field note contractとdeck/tag contractは変更しない。生成元はSayDeck内の監査・比較用metadataとし、MVPではAnki fieldやtagへ追加しない。

### Sakana acceptance gate

Sakana providerを利用可能として実装へ組み込む前に、実際の`SAKANA_API_KEY`で次を確認する。

1. Models APIまたは最小Responses APIへ接続できる。
2. SayDeckの構造JSON Schemaを`text.format.type=json_schema`で受理する。
3. 日本語入力から主・副シチュエーション、1〜8意味単位、必須standard、4 alternatives評価を返す。
4. 既存のserver-side normalizationを通過する。
5. provider responseやkeyをlogへ保存しない。

条件を満たさない場合、Sakanaを選択肢へ公開せず、原因を仕様差またはmodel品質として記録する。

2026-08-03の実key検証ではModels APIが`fugu`と`fugu-ultra`系modelを返し、`fugu`がUTF-8日本語入力を3つの妥当な意味単位へ分割した。各standardは14語、11語、9語で、4 alternativesも所定順で返ったため採用条件を満たした。

一方、文字数・件数・enum・nullableをすべて組み合わせたfull schemaはprovider側の`invalid request`になった。Sakana送信時はobject構造、必須field、基本型を含むstrict schemaへ簡略化し、件数、文字数、固定値、target順、applicableとnullの整合は既存のserver-side normalizationで検証する。検証を通らないresponseは保存しない。

## Data changes

`0014-owner-ai-provider-selection.sql`で次を追加する。

```text
owner_ai_settings
  owner_login PK
  active_provider: xai | sakana
  created_at
  updated_at

sentence_cards
  generation_provider: xai | sakana
  generation_model: text
```

provider変更は新しいgenerationにだけ適用する。保存済みカードのprovenanceを書き換えない。

## API changes

```text
GET   /api/settings/ai
PATCH /api/settings/ai
POST  /api/settings/ai/probe
```

全endpointをGitHub owner認証で保護する。Slack操作はSlack署名、member ID、workspace IDを検証した後、同じowner設定serviceを呼ぶ。

## Consequences

### Positive

- xAIとSakana AIを同じSayDeck契約で比較できる。
- BrowserとSlackで選択が一致する。
- 過去カードの生成元を後から確認できる。
- secretをDBやclientへ出さずに運用できる。

### Trade-offs

- providerごとにResponses APIのstructured output指定が異なるためadapterが必要になる。
- provider障害時の自動継続性より、比較可能性と明示的な失敗を優先する。
- provider設定をDBへ追加するためmigration適用が必要になる。
