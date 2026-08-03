# Slack／Discordからのカード作成

## MVPの対象

ブラウザのGitHub owner認証は維持したまま、同じownerだけがSlackまたはDiscordから日本語を送り、AI候補を確認してSayDeckへ登録できる。

- Slack: Botへのメンション、DM、`/saydeck`を受け付ける。チャンネルでは返信と承認カードをスレッド内に置く。
- Slack: `/saydeck model`で現在の生成providerを確認し、`/saydeck modelchange`のボタンでxAI／Sakana AIを切り替える。
- Discord: HTTP Interactionsの`/saydeck`と承認ボタンを受け付ける。常時接続GatewayはMVPに含めない。
- 共通: AI生成だけではLISTSへ登録せず、`登録`ボタンを押した時点で全候補を登録する。`破棄`では下書きをarchiveする。
- 共通: 登録後のカードは通常のLISTSとEXPORTに入り、ブラウザから作ったカードと同じDB・Anki契約を使う。

Slack無料プランの会話履歴には表示・保持期間の制限があるが、承認済みのSayDeckカードはNeonに保存されるため、Slackメッセージの表示期間には依存しない。Slack側の最新条件は[Free版の機能制限](https://slack.com/help/articles/27204752526611-Feature-limitations-on-the-free-version-of-Slack)を確認する。

初回導入はplatform別の手順を正本とする。

- [Slack初回インストール・セットアップ](slack-first-setup.md)
- [Discord初回インストール・セットアップ](discord-first-setup.md)

## 全体フロー

```text
Slack / Discordの署名付きWebhook
  → Chat SDKがSlack署名 / Discord Ed25519署名を検証
  → platform user ID（必要ならworkspace / guild IDも）を許可リスト照合
  → server側でGITHUB_OWNERへ固定マッピング
  → expression_entriesへdraft作成
  → 既存のAI生成・主副シチュエーション提案
  → chat_card_requestsをawaiting_approvalへ更新
  → Slack thread / Discord responseに候補と「登録」「破棄」ボタン
  → owner本人のボタン操作を再認証
  → 登録: approveExpressionEntry / 破棄: archiveExpressionEntry
```

署名検証は「Slack／Discordから届いた改ざんされていないリクエスト」であることを保証する。owner照合は「許可された本人の操作」であることを保証する。この2つは別の認証境界として両方必須にする。表示名、メールアドレス、リクエスト本文の`owner_login`は認証に利用しない。

`chat_card_requests`の`(platform, source_event_id)`を一意にし、ボタン処理を状態遷移でclaimするため、Webhook再送やボタン連打で二重登録されない。AI提案の主・副シチュエーションは、ownerが`登録`を押すことで確定したものとして`selected_by=user`で保存する。

## DB

先に`db/migrations/0013-chat-card-approval.sql`と`0014-owner-ai-provider-selection.sql`をNeonへ番号順に適用する。次を作成・変更する。

- `chat_card_requests`: platform actor、元イベント、SayDeck entry、AIの分類候補、選択variant、承認状態を保持する業務テーブル。
- `chat_state_*`: Chat SDKのPostgres State Adapterが初回Webhookで自動作成する購読・lock・cache・queue用テーブル。
- `owner_ai_settings`: BrowserとSlackで共有するowner単位のactive provider。
- `sentence_cards.generation_provider / generation_model`: 生成時点のprovider/model。後から設定を切り替えても変更しない。

Chat SDKの内部stateはWebhook処理の排他制御用であり、カード登録の正本はSayDeck既存テーブルと`chat_card_requests`である。

## 環境変数

Vercel Productionへ次をserver-side環境変数として登録し、設定後にredeployする。

| 変数 | 必須 | 用途 |
|---|---:|---|
| `DATABASE_URL` | 共通 | SayDeckとChat SDK stateのNeon接続 |
| `GITHUB_OWNER` | 共通 | 認証済みchat actorの保存先owner。既定値は`kohei321dev` |
| `NEXTAUTH_URL` | 推奨 | 登録完了カードのLISTSリンク |
| `OWNER_AI_KEY` | xAI利用時 | xAI API key。既存名を維持 |
| `OWNER_AI_MODEL` | 任意 | xAI model。既定値`grok-4.3` |
| `SAKANA_API_KEY` | Sakana利用時 | Sakana AI API key |
| `SAKANA_AI_MODEL` | 任意 | Sakana AI model。既定値`fugu` |
| `SAKANA_AI_EFFORT` | 任意 | Sakana AI reasoning effort。既定値`high` |
| `SLACK_BOT_TOKEN` | Slack | `xoxb-...` bot token |
| `SLACK_SIGNING_SECRET` | Slack | Slack Webhook署名検証 |
| `SLACK_OWNER_USER_ID` | Slack | 許可するimmutable member ID（例: `U...`） |
| `SLACK_OWNER_TEAM_ID` | 推奨 | 許可するworkspace ID（例: `T...`） |
| `DISCORD_BOT_TOKEN` | Discord | Bot token |
| `DISCORD_PUBLIC_KEY` | Discord | Interactions署名検証 |
| `DISCORD_APPLICATION_ID` | Discord | Discord application ID |
| `DISCORD_OWNER_USER_ID` | Discord | 許可するimmutable user ID |
| `DISCORD_OWNER_GUILD_ID` | 推奨 | 許可するserver ID |
| `DISCORD_COMMAND_GUILD_ID` | 開発時任意 | `/saydeck`を即時反映するtest server ID |

Slackはプロフィールの「メンバーIDをコピー」、DiscordはDeveloper Modeを有効にして「ユーザーIDをコピー」でIDを取得する。secretやtokenをGitへ保存しない。

## Slack設定

詳細な初回導入は[Slack初回インストール・セットアップ](slack-first-setup.md)を参照する。以下は設定済みAppを確認するための要約である。

1. Slack App管理画面で「From an app manifest」を選び、`docs/integrations/slack-app-manifest.yaml`を読み込む。
2. Workspaceへinstallし、Bot User OAuth Tokenを`SLACK_BOT_TOKEN`へ保存する。
3. Basic InformationのSigning Secretを`SLACK_SIGNING_SECRET`へ保存する。
4. ownerのmember IDとworkspace IDを環境変数へ保存する。
5. Event Subscriptions、Interactivity、Slash CommandのURLがすべて次になっていることを確認する。

```text
https://scene-builder-tau.vercel.app/api/webhooks/slack
```

SlackはWebhookへ短時間で応答する必要があるため、HTTP応答後の処理はNext.js `after()`へ渡す。Chat SDKが署名検証と再送dedupeを担当する。詳細は[Slack adapter](https://chat-sdk.dev/adapters/official/slack)と[Slack request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack)を参照する。

`modelchange`はAPI keyそのものを変更しない。Vercelへ登録済みのproviderから有効な接続先を選ぶ操作である。キーの追加・ローテーションはVercel Production環境変数で行い、redeployする。

## Discord設定

詳細な初回導入は[Discord初回インストール・セットアップ](discord-first-setup.md)を参照する。以下は設定済みApplicationを確認するための要約である。

1. Discord Developer PortalでApplicationとBotを作成する。
2. General InformationのPublic Key、Application ID、Bot tokenを環境変数へ保存する。
3. Interactions Endpoint URLを次に設定する。

```text
https://scene-builder-tau.vercel.app/api/webhooks/discord
```

4. test serverへ即時反映する場合は`DISCORD_COMMAND_GUILD_ID`も設定し、次を実行する。本番global commandではこの変数を外して実行する。

```bash
npm run discord:register-command
```

DiscordのHTTP Interactionは3秒以内の初期応答が必要で、Chat SDKがdeferと署名検証を行う。詳細は[Discord Interactions](https://docs.discord.com/developers/interactions/receiving-and-responding)を参照する。

## E2E確認

### Slack

1. ownerがチャンネルで`@SayDeck 明日の会議は体調が悪いので欠席し、資料は午後に共有すると伝えたい`と投稿する。
2. 元メッセージのスレッドに生成中表示、その後に主・副シチュエーションと各表現候補が出る。
3. `登録`を1回押し、カードが「SayDeckへ登録しました」に変わる。
4. 同じボタンを再送しても重複カードが作られない。
5. ProductionのLISTSに1件だけ増え、EXPORT対象にできる。
6. 許可していないSlack userではAI呼び出しもDB draft作成も行われない。

### Discord

1. ownerが`/saydeck text:<日本語>`を実行する。
2. 生成候補を確認して`登録`を押す。
3. LISTSとEXPORTで同じカードを確認する。
4. 許可していないDiscord userではowner限定メッセージだけが返る。

失敗時に候補カードが残っている場合、登録処理は未確定のまま`awaiting_approval`へ戻るため、設定復旧後に同じ`登録`ボタンを再試行できる。
