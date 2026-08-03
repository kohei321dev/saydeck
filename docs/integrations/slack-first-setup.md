# Slack初回インストール・セットアップ

## この手順でできること

1つのSlack workspaceへSayDeck Appをinstallし、設定したowner本人だけが次を利用できる状態にする。

- チャンネルの`@SayDeck`メンション
- SayDeck AppへのDM
- `/saydeck <日本語>`
- `/saydeck model`による現在のAI provider確認
- `/saydeck modelchange`によるxAI／Sakana AIの切替
- thread内に返された候補の`登録`／`破棄`

SayDeckはsingle-workspace構成である。Slackの表示名やメールアドレスではなく、変更されないmember IDとworkspace IDでownerを照合する。

## 完了チェックリスト

- [ ] Slack／Discord対応コードがProductionへdeploy済み
- [ ] Neonへ`0013-chat-card-approval.sql`を適用済み
- [ ] Neonへ`0014-owner-ai-provider-selection.sql`を適用済み
- [ ] Slack Appをmanifestから作成済み
- [ ] Appをworkspaceへinstall済み
- [ ] Vercel ProductionへSlack環境変数を登録しredeploy済み
- [ ] Event SubscriptionsのRequest URLが`Verified`
- [ ] Interactivityと`/saydeck`のRequest URLを設定済み
- [ ] ownerによる生成→登録→LISTS確認が成功

## 1. SayDeck側を先に準備する

### 1-1. 対象コードをProductionへdeployする

Productionに次のendpointが含まれている必要がある。

```text
POST https://scene-builder-tau.vercel.app/api/webhooks/slack
```

ブラウザでURLを開くと`GET`になるため、`405 Method Not Allowed`でも異常ではない。Slackから届く署名付き`POST`で確認する。

### 1-2. Neonへmigrationを適用する

Neon SQL Editorで次のファイルを実行する。

```text
db/migrations/0013-chat-card-approval.sql
db/migrations/0014-owner-ai-provider-selection.sql
```

既存migrationは`0012`まで適用済みであることを前提とする。`0013`は既存カードを削除せず、chat承認状態用の`chat_card_requests`を追加する。`0014`はownerのprovider選択とカードの生成元provider/modelを追加し、既存カードをxAIとしてbackfillする。

## 2. Slack Appを作成する

1. [Slack API: Your Apps](https://api.slack.com/apps)を開く。
2. `Create New App`を押す。
3. `From an app manifest`を選ぶ。
4. SayDeckを利用するworkspaceを選ぶ。
5. `YAML`を選び、次のファイル内容を貼り付ける。

   ```text
   docs/integrations/slack-app-manifest.yaml
   ```

6. 内容を確認し、Appを作成する。

manifestにはbot user、`/saydeck`、Event Subscriptions、Interactivity、必要scopeが定義済みである。manifestの仕組みは[Slack公式 App manifests](https://docs.slack.dev/app-manifests/)を参照する。

初回作成時点ではVercelにSlack secretがないため、Request URLの検証が保留または失敗してもよい。環境変数を設定してredeployした後、手順6で再検証する。

## 3. credentialとowner IDを取得する

### 3-1. Signing Secret

1. Slack App管理画面の`Basic Information`を開く。
2. `App Credentials`の`Signing Secret`を表示して安全な場所へコピーする。
3. チャット、Git、Issue、スクリーンショットへ貼らない。

この値は`SLACK_SIGNING_SECRET`として使用し、Slackからのリクエスト署名と時刻を検証する。[Slack公式の署名検証](https://docs.slack.dev/authentication/verifying-requests-from-slack)も参照する。

### 3-2. AppをworkspaceへinstallしてBot Tokenを取得する

1. 左メニューの`OAuth & Permissions`を開く。
2. `Install to Workspace`を押す。
3. 権限一覧を確認して`Allow`する。
4. `Bot User OAuth Token`の`xoxb-...`を安全な場所へコピーする。

この値が`SLACK_BOT_TOKEN`である。scopeを後から変更した場合は`Reinstall to Workspace`が必要になる。installの詳細は[Slack公式 OAuth install](https://docs.slack.dev/authentication/installing-with-oauth/)を参照する。

### 3-3. owner member ID

1. Slackで自分のプロフィールを開く。
2. `More`または三点メニューから`Copy member ID`を選ぶ。
3. `U`または`W`で始まる値を控える。

この値が`SLACK_OWNER_USER_ID`である。Bot user自身のIDではなく、SayDeckを操作する本人のIDを使う。

### 3-4. workspace ID

Slack desktop／browserでworkspaceを開き、URLを確認する。

```text
https://app.slack.com/client/T0123456789/...
                             ^^^^^^^^^^^
```

`T`で始まる部分が`SLACK_OWNER_TEAM_ID`である。SayDeckでは別workspaceからの操作をfail closedにするため設定する。

## 4. Vercel Production環境変数を設定する

Vercel DashboardでSayDeck projectを開き、`Settings` → `Environment Variables`から次を`Production`へ登録する。

| Key | Value |
|---|---|
| `SLACK_BOT_TOKEN` | 手順3-2の`xoxb-...` |
| `SLACK_SIGNING_SECRET` | 手順3-1のSigning Secret |
| `SLACK_OWNER_USER_ID` | 手順3-3の本人member ID |
| `SLACK_OWNER_TEAM_ID` | 手順3-4のworkspace ID |

既存の`DATABASE_URL`、`GITHUB_OWNER`に加え、利用するproviderの`OWNER_AI_KEY`または`SAKANA_API_KEY`も必要である。値を登録しただけでは既存deploymentへ反映されないため、Productionをredeployする。

secretをVercel CLIのコマンド引数へ直接書かない。shell historyやログに残さないため、原則としてDashboardのsecret入力欄を使う。

## 5. Slack側の権限を確認する

App管理画面の`OAuth & Permissions`でBot Token Scopesが次になっていることを確認する。

```text
app_mentions:read
chat:write
commands
im:history
im:read
```

不足scopeを追加した場合はAppをworkspaceへ再installし、新しいtokenが表示された場合はVercelの`SLACK_BOT_TOKEN`も更新してredeployする。

App管理画面の`App Home`では`Messages Tab`が有効で、ユーザーからのメッセージ送信が許可されていることも確認する。manifestでは設定済みである。

## 6. Webhookを検証する

### 6-1. Event Subscriptions

1. `Event Subscriptions`を開く。
2. `Enable Events`をONにする。
3. Request URLへ次を設定する。

   ```text
   https://scene-builder-tau.vercel.app/api/webhooks/slack
   ```

4. `Verified`になることを確認する。
5. `Subscribe to bot events`に次があることを確認する。

   ```text
   app_mention
   message.im
   ```

### 6-2. Interactivity

1. `Interactivity & Shortcuts`を開く。
2. InteractivityをONにする。
3. Request URLを同じSlack webhook URLにする。

`登録`と`破棄`ボタンはこのURLへ届く。

### 6-3. Slash Command

1. `Slash Commands`を開く。
2. `/saydeck`が存在することを確認する。
3. Request URLを同じSlack webhook URLにする。

Slackのイベントとinteractivityは短時間でのHTTP応答が必要である。SayDeckは先に応答し、AI生成をVercelのbackground処理へ渡す。[Slack公式 Interactivity](https://docs.slack.dev/interactivity/handling-user-interaction/)を参照する。

## 7. 利用チャンネルへAppを追加する

テストするチャンネルで次を実行する。

```text
/invite @SayDeck
```

private channelではAppを明示的に追加する。追加できない場合はworkspace管理者のApp承認設定を確認する。

## 8. 初回E2Eテスト

### 8-1. メンション

owner本人で次を投稿する。

```text
@SayDeck 明日の予定を変更したいので、友人に午後3時ではなく5時に会えないか聞きたい。
```

確認項目:

1. 元メッセージのthreadに`英語表現を生成しています…`が出る。
2. 同じthreadに主・副シチュエーションと候補が出る。
3. `登録`と`破棄`が表示される。
4. `登録`を押すと`SayDeckへ登録しました`へ変わる。
5. [Production LISTS](https://scene-builder-tau.vercel.app/lists)に1 entryだけ増える。

### 8-2. Slash Command

```text
/saydeck 最近忙しくて返信が遅れたことを友人に謝りたい。
```

受付メッセージが作られ、そのthread内に候補が返ることを確認する。

### 8-3. DM

SlackのAppsからSayDeckを開き、日本語をDMする。DM内に候補が返ることを確認する。

### 8-4. owner制限

可能なら許可していないSlack userでも実行し、owner限定メッセージだけが返り、LISTSが増えないことを確認する。

## 9. 設定状態を確認する

GitHub ownerとしてSayDeckへloginし、次を開く。

```text
https://scene-builder-tau.vercel.app/api/diagnostics?probe=1
```

JSON内で次を確認する。

```text
diagnostics.chatCapture.slackConfigured = true
diagnostics.chatCapture.schemaReady = true
diagnostics.database.expressionSchemaReady = true
```

secretやtokenの値そのものは返さない。

## 10. トラブルシューティング

### Request URLがVerifiedにならない

- Productionへ対象コードをdeploy済みか確認する。
- Vercelの4つのSlack環境変数がすべてProductionへ設定されているか確認する。
- env変更後にredeployしたか確認する。
- `SLACK_SIGNING_SECRET`の前後に空白や引用符が入っていないか確認する。
- Neonへ`0013`と`0014`を適用済みか確認する。
- Vercel Function Logsで`/api/webhooks/slack`を確認する。tokenや署名値をログへ貼らない。

### メンションに反応しない

- Appが対象チャンネルへ追加されているか確認する。
- `app_mention` eventと`app_mentions:read` scopeを確認する。
- private channelでは`/invite @SayDeck`を実行する。

### DMに反応しない

- `message.im` event、`im:history`、`im:read`を確認する。
- scopeを変更した場合はAppを再installする。

### ボタンを押しても登録できない

- InteractivityのRequest URLを確認する。
- `SLACK_OWNER_USER_ID`が操作中の本人IDか確認する。
- `SLACK_OWNER_TEAM_ID`が現在のworkspace IDか確認する。
- diagnosticsでchat schemaとDB接続を確認する。

### 生成に失敗する

- `/saydeck model`で選択中providerを確認する。
- xAIなら`OWNER_AI_KEY`／`OWNER_AI_MODEL`、Sakana AIなら`SAKANA_API_KEY`／`SAKANA_AI_MODEL`と利用上限を確認する。
- `DATABASE_URL`とmigrationを確認する。
- 失敗した候補が承認待ちで残っている場合は復旧後に`登録`を再試行する。生成自体が失敗した場合は新しいメッセージで再試行する。

## 11. 運用上の注意

- Bot tokenまたはSigning Secretが漏えいした場合はSlack側で直ちにrotateし、Vercelを更新してredeployする。
- ownerのSlack accountを変更した場合は`SLACK_OWNER_USER_ID`を更新する。
- 別workspaceへinstallする場合、現行のsingle-workspace前提を再設計せずtokenだけを使い回さない。
- Slack無料プランの履歴制限に関係なく、`登録`済みカードの正本はNeonに残る。[Slack無料プランの制限](https://slack.com/help/articles/27204752526611-Feature-limitations-on-the-free-version-of-Slack)を参照する。
