# Slackスラッシュコマンド導入リファレンス

## 目的

SayDeckで実施したSlack連携を、Spot-Diggzなど別のWebアプリへ安全に横展開するためのリファレンスである。

対象は、Slackのスラッシュコマンドから入力を受け取り、HTTP APIで処理し、必要に応じて確認ボタンを返してからDBへ確定する構成である。Slack CLIでSlack Appを開発・deployする構成ではなく、既存のNext.js／VercelアプリをSlackの外部HTTP endpointとして使う。

## 今回の結論

- Slack CLIのaccount認証は、このHTTP連携には不要だった。
- Slack Appは[App Manifest](https://docs.slack.dev/app-manifests/)から作成した。
- Slack Appのinstall、Signing Secretの取得、本人member IDの取得だけはSlack画面で行った。
- secretはチャットやshell historyへ貼らず、ローカルPowerShellからVercel CLIの標準入力へ渡した。
- Production環境変数を設定した後、必ずredeployした。
- Slash Commandを追加・変更した後は`Reinstall to Workspace`が必要だった。
- Slack clientも再読み込みしないと、新しいcommandを認識しない場合があった。

## 全体構成

```text
Slack user
  → /saydeck 日本語入力
  → Slackが署名付きPOSTをWebhookへ送信
  → POST /api/webhooks/slack
  → Signing Secretで署名とtimestampを検証
  → member IDとworkspace IDで利用者を照合
  → Slackへ先に受付応答
  → AI生成とDB下書き作成をbackground処理
  → Slack threadへ候補と「登録」「破棄」ボタン
  → ボタン操作も同じWebhookへ署名付きPOST
  → 「登録」の場合だけ業務データを確定
```

Slackは短時間のHTTP応答を必要とするため、AI処理の完了を待ってから最初の応答を返す設計にしない。SayDeckではNext.jsの`after()`へbackground taskを渡している。Slackのinteractive payloadについては[公式ドキュメント](https://docs.slack.dev/interactivity/handling-user-interaction/)を参照する。

## SayDeckで設定したもの

### Slack App

| 項目 | SayDeckの設定 |
|---|---|
| App名 | `SayDeck` |
| Slash Command | `/saydeck` |
| Request URL | `https://scene-builder-tau.vercel.app/api/webhooks/slack` |
| Bot scopes | `commands`, `chat:write`, `app_mentions:read`, `im:history`, `im:read` |
| Bot events | `app_mention`, `message.im` |
| Interactivity | 有効。同じRequest URLを使用 |
| Socket Mode | 無効 |

スラッシュコマンドだけを実装するアプリでは、通常`commands`と返信に必要な`chat:write`が最小構成になる。メンションとDMも受け取る場合だけ、SayDeckと同様に追加scopeとevent subscriptionを設定する。

### Vercel Production環境変数

| 変数 | 用途 |
|---|---|
| `SLACK_BOT_TOKEN` | Workspaceへinstall後に発行される`xoxb-...` |
| `SLACK_SIGNING_SECRET` | Slackから届いたrequestの署名検証 |
| `SLACK_OWNER_USER_ID` | 利用を許可する本人のimmutable member ID |
| `SLACK_OWNER_TEAM_ID` | 利用を許可するworkspace ID |

値そのものはドキュメント、Git、Issue、チャットへ記録しない。Slackのrequest署名検証は[Slack公式手順](https://docs.slack.dev/authentication/verifying-requests-from-slack)に従う。

### アプリケーション

- Webhook route: `src/app/api/webhooks/[platform]/route.ts`
- Slack adapterとhandler: `src/lib/saydeck-chat-bot.ts`
- owner認可: `src/lib/chat-capture-auth.ts`
- 下書き・承認処理: `src/lib/chat-card-service.ts`
- 承認状態store: `src/lib/chat-card-store.ts`
- DB migrations: `db/migrations/0013-chat-card-approval.sql`、`db/migrations/0014-owner-ai-provider-selection.sql`
- Slack manifest: `docs/integrations/slack-app-manifest.yaml`
- secret入力用CLI: `scripts/configure-slack-vercel.ps1`

使用packageは`chat`、`@chat-adapter/slack`、`@chat-adapter/state-pg`である。adapterがSlack署名検証、event変換、返信、button actionを担当し、業務上の認可とDB確定はアプリケーション側で行う。

## Slack App作成手順

1. [Slack API: Your Apps](https://api.slack.com/apps)を開く。
2. `Create New App`を押す。
3. `From an app manifest`を選ぶ。
4. 対象workspaceを選ぶ。
5. YAML manifestを貼り付ける。
6. Appを作成する。
7. `OAuth & Permissions`から`Install to Workspace`を実行する。
8. `Allow`で権限を承認する。
9. `Basic Information`からSigning Secretを取得する。
10. `OAuth & Permissions`からBot User OAuth Tokenを取得する。
11. Productionへ環境変数を登録してredeployする。
12. `Event Subscriptions`のRequest URLが`Verified`になることを確認する。
13. `Interactivity & Shortcuts`とSlash Commandにも同じRequest URLを設定する。
14. `Reinstall to Workspace`を実行する。
15. Slackを再読み込みしてcommandを試す。

Appのscopeを変更した場合も再installが必要である。OAuth installの詳細は[Slack公式ドキュメント](https://docs.slack.dev/authentication/installing-with-oauth/)を参照する。

## Backend実装の必須要件

### 1. 署名検証

次の値を検証する。

- `X-Slack-Signature`
- `X-Slack-Request-Timestamp`
- requestのraw body
- Signing Secret

timestampが許容時間を超えたrequestはreplay攻撃として拒否する。JSONへparseした後のbodyではなく、受信したraw bodyを署名計算に使う。Slack adapterを利用する場合も、検証が有効であることをテストする。

### 2. owner認可

Slackの表示名やメールアドレスではなく、次を完全一致で照合する。

- request user IDと許可済みmember ID
- request team IDと許可済みworkspace ID

未設定時や値が取れない場合は許可せず、fail closedにする。Bot Tokenが正しいだけではアプリケーション利用者の本人確認にはならない。

### 3. 即時応答とbackground処理

スラッシュコマンド受信後は先に受付応答を返し、AI、外部API、重いDB処理をbackgroundへ渡す。処理中表示を作成し、完了後にeditする方法が分かりやすい。

### 4. 冪等性

Slackは失敗やtimeout時にrequestを再送する可能性がある。Slack event ID、trigger ID、またはアプリ側request IDを一意制約で保持し、同じ入力を二重登録しない。

SayDeckでは`(platform, source_event_id)`を一意にし、承認ボタンも状態遷移でclaimしている。ボタン連打時も確定処理を1回に制限する。

### 5. 下書きと確定データの分離

確認フローがある場合、AI生成完了だけで業務データを確定しない。

```text
generating
  → awaiting_approval
  → approving
  → approved

awaiting_approval
  → rejected

任意の生成処理
  → failed
```

`登録`で初めて業務データを有効化し、`破棄`では下書きをarchiveまたはrejectedにする。

## Vercelへの設定

SayDeckでは次のスクリプトを使用した。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-slack-vercel.ps1
```

スクリプトは以下を行う。

1. Bot TokenとSigning Secretを非表示入力で受け取る。
2. Slack `auth.test`でBot Tokenとworkspaceを検証する。
3. `team_id`を自動取得する。
4. owner member IDを受け取る。
5. 4変数をVercel Productionへsensitive valueとして登録する。

設定後はProductionをredeployする。

```powershell
npx vercel deploy --prod --yes
```

環境変数を追加しただけでは、すでに動いているdeploymentへ反映されない。

## 動作確認

### Webhook存在確認

署名なしPOSTに対して、次のようになることを確認する。

```text
404                  → routeが未deploy、またはURLが誤り
503                  → Slack環境変数などruntime設定が不足
401 Invalid signature → routeと署名検証が動作中。署名なし確認として正常
```

### E2E

1. 許可済みownerが`/saydeck model`を実行し、現在のproviderとmodelを確認する。
2. `/saydeck modelchange`を実行し、接続設定済みproviderへ切り替える。
3. `/saydeck <日本語>`を実行し、受付応答とbackground処理後の候補を確認する。
4. `登録`ボタンを押す。
5. LISTSでprovider/model属性とデータ確定を確認する。
6. 同じボタンを再度押しても二重登録されないことを確認する。
7. 許可していないuserからは確認・切替・生成を実行できないことを確認する。

## 今回発生した問題

### `slack`コマンドが見つからない

Slack CLIのuser PATHが、起動済みPowerShellへ反映されていなかった。新しいterminalを開くか、実体をフルパスで呼べば解消する。ただし、今回の外部HTTP App作成にSlack CLI認証は不要だった。

### `missing_authorization`

Slack CLIのauth ticket交換で発生した。今回必要なのはSlack-hosted appのdeployではなく、既存Webアプリへ届くHTTP Appなので、CLI認証を中止してApp Manifestによる作成へ切り替えた。

### `/saydeck`は有効なコマンドではない

Slack App管理画面にはcommandが存在していたが、workspace側のinstall状態へ反映されていなかった。

解消手順:

1. Slash CommandのRequest URLを確認して`Save Changes`。
2. `OAuth & Permissions`で`Reinstall to Workspace`。
3. Slackを再読み込み。

### Request URLが検証されない

1. endpointがProductionへdeploy済みか確認する。
2. Signing SecretをProductionへ設定する。
3. env設定後にredeployする。
4. Slack画面で`Retry`または再保存する。

## Spot-Diggzへ置き換える項目

| SayDeck | Spot-Diggzで決める値 |
|---|---|
| App名 `SayDeck` | `Spot-Diggz`など正式な表示名 |
| `/saydeck` | `/spotdiggz`を推奨 |
| SayDeck production domain | Spot-Diggz production domain |
| `/api/webhooks/slack` | Spot-DiggzのSlack POST endpoint |
| `saydeck_register` | Spot-Diggz固有のaction ID |
| `saydeck_reject` | Spot-Diggz固有のaction ID |
| `chat_card_requests` | Spot-Diggzの下書き・承認状態テーブル |
| SayDeck card確定処理 | Spot-Diggzの業務データ確定処理 |

Spot-Diggzがスラッシュコマンドだけを必要とするなら、SayDeckのDM／mention機能はコピーせず、manifestを最小化する。

```yaml
display_information:
  name: Spot-Diggz
features:
  bot_user:
    display_name: Spot-Diggz
    always_online: false
  slash_commands:
    - command: /spotdiggz
      url: https://YOUR_DOMAIN/api/webhooks/slack
      description: Spot-Diggzへリクエストを送信
      should_escape: false
oauth_config:
  scopes:
    bot:
      - commands
      - chat:write
settings:
  interactivity:
    is_enabled: true
    request_url: https://YOUR_DOMAIN/api/webhooks/slack
  socket_mode_enabled: false
```

確認ボタンを使わない場合はInteractivityも削除できる。必要な機能だけをmanifestへ含める。

## Spot-Diggz実装前チェックリスト

- [ ] production domainとWebhook URLを決定した
- [ ] slash command名を決定した
- [ ] command入力から実行する業務処理を決定した
- [ ] 即時応答後にbackground処理する設計にした
- [ ] Slack署名とtimestampを検証する
- [ ] user IDとworkspace IDで認可する
- [ ] retryとボタン連打に対する冪等性を用意する
- [ ] 下書きと確定データを分離するか決定した
- [ ] manifestからSlack Appを作成した
- [ ] workspaceへinstallした
- [ ] secretをProduction環境変数へ設定した
- [ ] env設定後にredeployした
- [ ] command変更後にreinstallした
- [ ] owner／非ownerのE2Eを確認した
