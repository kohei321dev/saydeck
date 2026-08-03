# Discord初回インストール・セットアップ

## この手順でできること

1つのDiscord serverへSayDeck Appをinstallし、設定したowner本人だけが次を利用できる状態にする。

- `/saydeck text:<日本語>`
- 生成候補の`登録`／`破棄`
- 登録済みカードの既存LISTS／EXPORT利用

MVPはDiscord HTTP Interactionsを利用する。通常メッセージ、DM、`@SayDeck`メンションはGateway接続が必要なため、この手順の対象外である。

## 完了チェックリスト

- [ ] Slack／Discord対応コードがProductionへdeploy済み
- [ ] Neonへ`0013-chat-card-approval.sql`を適用済み
- [ ] Discord ApplicationとBotを作成済み
- [ ] Botを対象serverへinstall済み
- [ ] Vercel ProductionへDiscord環境変数を登録しredeploy済み
- [ ] Interactions Endpoint URLの保存に成功
- [ ] test serverへ`/saydeck`を登録済み
- [ ] ownerによる生成→登録→LISTS確認が成功

## 1. SayDeck側を先に準備する

### 1-1. 対象コードをProductionへdeployする

Productionに次のendpointが含まれている必要がある。

```text
POST https://scene-builder-tau.vercel.app/api/webhooks/discord
```

ブラウザで開くと`GET`になるため、`405 Method Not Allowed`でも異常ではない。Discordの署名付き`POST`で検証する。

### 1-2. Neonへmigrationを適用する

Neon SQL Editorで次を実行する。

```text
db/migrations/0013-chat-card-approval.sql
```

既存migrationは`0012`まで適用済みであることを前提とする。`0013`は既存カードを削除しない。

## 2. Discord Applicationを作成する

1. [Discord Developer Portal](https://discord.com/developers/applications)を開く。
2. `New Application`を押す。
3. 名前を`SayDeck`にする。
4. 規約を確認してApplicationを作成する。
5. `General Information`を開く。
6. 次の2つを安全な場所へ控える。

| Portal表示 | SayDeck環境変数 |
|---|---|
| Application ID | `DISCORD_APPLICATION_ID` |
| Public Key | `DISCORD_PUBLIC_KEY` |

Public KeyはWebhook署名検証に利用する。Application作成の基本手順は[Discord公式 Getting Started](https://docs.discord.com/developers/quick-start/getting-started)を参照する。

## 3. Botを作成してtokenを取得する

1. 左メニューの`Bot`を開く。
2. Botが未作成なら`Add Bot`を押す。
3. `Reset Token`を押し、表示されたtokenを安全な場所へコピーする。
4. この値を`DISCORD_BOT_TOKEN`として使用する。
5. 個人利用では、可能であれば`Public Bot`をOFFにする。

tokenは再表示できない場合がある。Git、Issue、チャット、スクリーンショットへ保存しない。漏えいした場合は`Reset Token`して旧tokenを無効化する。

MVPはHTTP Interactionsだけを使うため、`Message Content Intent`や`Server Members Intent`などのPrivileged Gateway Intentsは不要である。

## 4. Botのinstall設定を作る

Developer Portalの`Installation`を開く。画面に`Default Install Settings`がある場合は`Guild Install`へ次を設定する。

### Scopes

```text
applications.commands
bot
```

### Bot Permissions

```text
View Channels
Send Messages
Embed Links
```

Portalに`Installation`設定がない場合は`OAuth2` → `URL Generator`で同じscopeとpermissionを選ぶ。

1. 生成されたInstall Linkを開く。
2. SayDeckを使うserverを選ぶ。
3. 権限を確認してinstallする。

serverへBotを追加するユーザーには`Manage Server`相当の権限が必要である。将来thread内送信や添付ファイルを追加する場合は、その時点で追加permissionを検討する。現行MVPには不要である。

## 5. owner user IDとserver IDを取得する

### 5-1. Developer Modeを有効にする

Discord clientの`User Settings` → `Advanced` → `Developer Mode`をONにする。

### 5-2. owner user ID

1. 自分のプロフィールまたは名前を右クリックする。
2. `Copy User ID`を選ぶ。

この数値が`DISCORD_OWNER_USER_ID`である。BotのApplication IDやBot user IDではなく、SayDeckを操作する本人のIDを使う。

### 5-3. server ID

1. 対象serverのアイコンまたはserver名を右クリックする。
2. `Copy Server ID`を選ぶ。

この数値が`DISCORD_OWNER_GUILD_ID`である。ID取得は[Discord公式サポート](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID)も参照する。

## 6. Vercel Production環境変数を設定する

Vercel DashboardでSayDeck projectを開き、`Settings` → `Environment Variables`から次を`Production`へ登録する。

| Key | Value |
|---|---|
| `DISCORD_BOT_TOKEN` | 手順3のBot token |
| `DISCORD_PUBLIC_KEY` | 手順2のPublic Key |
| `DISCORD_APPLICATION_ID` | 手順2のApplication ID |
| `DISCORD_OWNER_USER_ID` | 手順5-2の本人user ID |
| `DISCORD_OWNER_GUILD_ID` | 手順5-3のserver ID |

既存の`DATABASE_URL`、`GITHUB_OWNER`、`OWNER_AI_KEY`も必要である。設定後にProductionをredeployする。

`DISCORD_COMMAND_GUILD_ID`はコマンド登録script用のローカル変数であり、Vercel runtimeには不要である。

## 7. Interactions Endpoint URLを設定する

Vercelのredeploy完了後に実施する。

1. Discord Developer Portalの`General Information`を開く。
2. `Interactions Endpoint URL`へ次を入力する。

   ```text
   https://scene-builder-tau.vercel.app/api/webhooks/discord
   ```

3. `Save Changes`を押す。
4. validationに成功することを確認する。

Discordは署名付きPINGを送り、SayDeckのChat SDK adapterが署名を検証して応答する。HTTP Interactionの仕様は[Discord公式 Receiving and Responding](https://docs.discord.com/developers/interactions/receiving-and-responding)を参照する。

## 8. `/saydeck`コマンドを登録する

Chat SDKは受信を処理するが、Discord Application Command自体はDiscord APIへ別途登録する必要がある。[Discord公式 Application Commands](https://docs.discord.com/developers/interactions/application-commands)を参照する。

初回確認では反映の早いguild commandを推奨する。

### 8-1. PowerShellでsecretを入力する

repository rootで実行する。Bot tokenをshell historyへ残さないよう、`Read-Host -AsSecureString`を使う。

```powershell
$env:DISCORD_APPLICATION_ID = Read-Host "Application ID"
$env:DISCORD_COMMAND_GUILD_ID = Read-Host "Test Server ID"
$discordToken = Read-Host "Bot Token" -AsSecureString
$env:DISCORD_BOT_TOKEN = [System.Net.NetworkCredential]::new("", $discordToken).Password
npm.cmd run discord:register-command
Remove-Item Env:DISCORD_BOT_TOKEN
Remove-Item Env:DISCORD_APPLICATION_ID
Remove-Item Env:DISCORD_COMMAND_GUILD_ID
Remove-Variable discordToken
```

成功例:

```text
Registered /saydeck command (...) in guild ....
```

### 8-2. global commandへ移行する場合

`DISCORD_COMMAND_GUILD_ID`を設定せず、Application IDとBot tokenだけで同じscriptを実行する。global commandはDiscord clientへの反映に時間差が生じる場合があるため、初回E2Eはguild commandで行う。

同名のguild commandがあるserverではguild版が優先される。テストが安定するまではguild版を維持してよい。

## 9. 初回E2Eテスト

対象serverのBotが投稿できるチャンネルで次を実行する。

```text
/saydeck text:明日の予定を変更したいので、友人に午後3時ではなく5時に会えないか聞きたい。
```

確認項目:

1. `英語表現を生成しています…`が表示される。
2. 主・副シチュエーションと各候補が表示される。
3. `登録`と`破棄`が表示される。
4. `登録`を押すと`SayDeckへ登録しました`へ変わる。
5. [Production LISTS](https://scene-builder-tau.vercel.app/lists)に1 entryだけ増える。
6. 同じボタンを再送しても重複entryが作られない。

可能なら許可していないDiscord userでも`/saydeck`を実行し、owner限定メッセージだけが返り、LISTSが増えないことを確認する。

## 10. 設定状態を確認する

GitHub ownerとしてSayDeckへloginし、次を開く。

```text
https://scene-builder-tau.vercel.app/api/diagnostics?probe=1
```

JSON内で次を確認する。

```text
diagnostics.chatCapture.discordConfigured = true
diagnostics.chatCapture.schemaReady = true
diagnostics.database.expressionSchemaReady = true
```

## 11. トラブルシューティング

### Interactions Endpoint URLを保存できない

- Productionへ対象コードをdeploy済みか確認する。
- Discordの5環境変数がすべてProductionへ設定されているか確認する。
- env変更後にredeployしたか確認する。
- `DISCORD_PUBLIC_KEY`へBot tokenではなくGeneral InformationのPublic Keyを設定したか確認する。
- Public Keyの前後に空白や引用符がないか確認する。
- Neonへ`0013`を適用済みか確認する。
- Vercel Function Logsで`/api/webhooks/discord`を確認する。credentialをログへ貼らない。

### `/saydeck`が候補に出ない

- command登録scriptが成功したか確認する。
- `DISCORD_APPLICATION_ID`がinstallしたApplicationと一致するか確認する。
- `DISCORD_COMMAND_GUILD_ID`が現在のtest server IDと一致するか確認する。
- Botを対象serverへinstall済みか確認する。
- Discord clientを再読み込みする。

### `Missing Access`または投稿できない

- Botが対象serverとchannelを閲覧できるか確認する。
- `View Channels`、`Send Messages`、`Embed Links`を確認する。
- channel固有のpermission overrideでBotが拒否されていないか確認する。

### ボタンを押すとowner限定になる

- `DISCORD_OWNER_USER_ID`が操作中の本人user IDか確認する。
- `DISCORD_OWNER_GUILD_ID`が現在のserver IDか確認する。
- Bot ID、Application ID、User IDを取り違えていないか確認する。

### `thinking...`の後に失敗する

- `OWNER_AI_KEY`、AI利用上限、`DATABASE_URL`を確認する。
- Neonへ`0013`を適用済みか確認する。
- Vercel Function Logsでtimeoutまたはprovider errorを確認する。
- 失敗した候補が承認待ちなら復旧後に`登録`を再試行する。生成自体が失敗した場合は新しいcommandで再試行する。

### 通常メッセージやメンションに反応しない

正常なMVP動作である。Discordの通常メッセージ、DM、メンションを受信するにはGateway WebSocketが必要で、現行SayDeckはserverless向けHTTP Interactionsだけを利用する。入力は`/saydeck`を使う。[Chat SDK Discord adapter](https://chat-sdk.dev/adapters/official/discord)も参照する。

## 12. 運用上の注意

- Bot tokenが漏えいした場合はDeveloper Portalの`Bot`で直ちに`Reset Token`し、Vercelを更新してredeployする。
- Public KeyまたはApplicationを変更した場合はInteractions Endpointを再検証する。
- owner accountまたは利用serverを変更した場合はowner user ID／guild IDを更新する。
- Botを別serverへ無制限にinstallしても、`DISCORD_OWNER_GUILD_ID`以外からの操作は拒否される。
- Discord会話履歴をカードの正本にせず、`登録`済みカードはNeonで管理する。
