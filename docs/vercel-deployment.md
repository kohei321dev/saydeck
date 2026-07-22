# Vercel Deployment

## Naming boundary

[事実] local project directory、npm package、GitHub remote repositoryは`saydeck`である。Vercel project名は既存の`saydecks`を維持する。

[事実] Vercel project名は`scene-builder`から`saydecks`へ変更済みだが、Production domainとOAuth callback URLは既存のままである。この文書で参照するdomainは実運用中のOAuth callback URLと`NEXTAUTH_URL`の正本である。新domainへ変更する場合は、Vercel、`NEXTAUTH_URL`、GitHub OAuth、Google OAuthを同じ切替で更新し、owner loginを確認するまで現行domainを維持する。

## Auth, AI, Database

[事実] This app uses NextAuth with GitHub OAuth.

[事実] GitHub sign-in grants `owner` when the GitHub `login` matches `GITHUB_OWNER`, which defaults to `kohei321dev`; other GitHub logins cannot use owner routes.

[事実] Expression generation uses `OWNER_AI_KEY` from server-side API routes. The browser never receives the API key.

[事実] Expression entries, level variants, audio metadata, and APKG export state are stored in Postgres through `DATABASE_URL`. ADR 0008 selects Neon Postgres as the first cloud database target.

## GitHub OAuth App

Create an OAuth App from GitHub Developer Settings.

For production:

- Homepage URL: `https://<your-vercel-domain>`
- Authorization callback URL: `https://<your-vercel-domain>/api/auth/callback/github`

For local development, create a separate OAuth App:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Use the generated Client ID and Client Secret as Vercel env vars.

## Preview Deployment Policy

[判断] SayDeckではPR PreviewをUI確認の必須導線から外す。理由は、PR/commitごとに変わるPreview URLとGitHub OAuth callback URLの整合を安全に保ちにくく、Production用secretをPreviewへ持ち込む運用に寄りやすいため。

[判断] Vercelの自動deploymentは `main` だけ有効にし、PR branch / 作業branchのPreview deploymentは作成しない。repo側では `vercel.json` の `git.deploymentEnabled` で `main` を `true`、その他branchを `false` にする。

[事実] Vercelの `git.deploymentEnabled` はbranch patternごとに自動deploymentの有効/無効を指定できる。複数のruleに一致する場合、少なくとも1つが `true` ならdeploymentされるため、`main` はProduction用に維持される。

```json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "*": false
    }
  }
}
```

PR作成前後のUI確認は、Preview URLではなくローカルサーバーで行う。

```bash
DEV_AUTH_BYPASS=1 npm run dev
```

確認URLは `http://localhost:3000` とする。DB / AI / OAuth credentialが必要な範囲は、ローカルでenvを用意した場合だけ確認する。GitHub OAuthの本番確認は、merge後にProduction正式ドメインで行う。

Preview deploymentを再度使う必要が出た場合は、固定Preview/Staging domain、専用OAuth App、専用secret、DB write範囲を同じ変更単位で再設計する。Production用secretや本番DB write前提をPreviewへコピーしない。

## OAuth Verification Policy

[事実] GitHub OAuth AppのAuthorization callback URLは完全一致で検証される。

[事実] NextAuthのProduction canonical URLは `NEXTAUTH_URL` で固定する。
`NEXTAUTH_URL` とOAuth provider側のcallback URLが別のdomainを指すと、
provider認証後にcallback mismatchまたは意図しないredirectが起きる。

[事実] Vercel Preview URLやdeployment URLはbranch、PR、commitごとに変わる場合がある。そのURLをGitHub OAuth Appへ登録していない場合、GitHub sign-inは `redirect_uri` mismatchで失敗する。

[判断] GitHub owner sign-in、Google guest sign-in、未ログインredirect、権限外accountの `/denied` はProduction正式ドメインだけを検証対象にする。

PRごと、commitごとの一時Preview URLをProduction用GitHub OAuth Appへ都度登録しない。Production用OAuth clientはProduction正式ドメイン用として扱う。

## Production OAuth Verification Checklist

Use the Production formal domain as the only OAuth browser verification target:

```text
https://scene-builder-tau.vercel.app
```

Do not use PR Preview URLs, commit deployment URLs, or branch deployment URLs
for OAuth provider verification.

### Before PR

- Run the app locally with `DEV_AUTH_BYPASS=1 npm run dev`.
- Confirm the root redirects to the expression INPUT screen at `http://localhost:3000/create`.
- Confirm `/signin?setup=1` explains missing OAuth setup when local OAuth env
  vars are intentionally absent.
- Do not change Production OAuth provider settings for a PR-only check.
- Do not copy Production secrets into Preview or local `.env` files for UI-only
  verification.

### After Merge To Production

- Confirm Vercel Production env includes `NEXTAUTH_URL` and that it exactly
  matches the Production formal domain.
- Confirm the GitHub OAuth App callback URL exactly matches:
  `https://scene-builder-tau.vercel.app/api/auth/callback/github`.
- If Google OAuth is enabled in the release, confirm the Google OAuth callback
  URL exactly matches:
  `https://scene-builder-tau.vercel.app/api/auth/callback/google`.
- Open `/api/auth/providers` on the Production domain and confirm only the
  intended providers are listed.
- Sign in with the GitHub owner account and confirm the app opens with owner
  actions available.
- Sign out, then open the Production root in a fresh session and confirm the
  unauthenticated user redirects to `/signin`.
- Sign in with a non-owner GitHub account and confirm it reaches `/denied`.

### Callback Mismatch Triage

When provider authentication fails before returning to the app, check these
places without pasting secrets or raw provider payloads into issues:

- Vercel Production env: `NEXTAUTH_URL`
- Vercel Production env: provider client ID and secret are present
- GitHub OAuth App: Authorization callback URL
- Google OAuth client: Authorized redirect URI, if Google OAuth is enabled
- Browser URL after failure: provider name and error category only
- Production `/api/auth/providers`: provider is present only when intended

## Environment Variables

Set these in Vercel Project Settings > Environment Variables for Production.

```text
NEXTAUTH_URL=https://scene-builder-tau.vercel.app
AUTH_SECRET=<cryptographically-random-secret>
GITHUB_CLIENT_ID=<github-oauth-client-id>
GITHUB_CLIENT_SECRET=<github-oauth-client-secret>
GITHUB_OWNER=kohei321dev
OWNER_AI_KEY=<owner-grok-api-key>
OWNER_AI_MODEL=grok-4.3
DATABASE_URL=<neon-postgres-connection-string>
SAYDECK_TTS_API_KEY=<server-only-speech-api-key>
SAYDECK_TTS_BASE_URL=https://api.openai.com/v1
SAYDECK_TTS_MODEL=tts-1
SAYDECK_TTS_VOICE=alloy
SAYDECK_TTS_SPEED=1.0
BLOB_READ_WRITE_TOKEN=<private-vercel-blob-token>
```

Do not set `DEV_AUTH_BYPASS` in Vercel Production.

After changing any Vercel environment variable, redeploy. Vercel applies env changes only to new deployments.

Preview用のEnvironment Variablesは現在は管理しない。Preview deploymentsを再度使う場合は、Productionとは別のsecretとOAuth credentialを用意する。

## Neon Postgres Setup

1. Create or connect a Neon project from Vercel Marketplace, or create a Neon database manually.
2. Set `DATABASE_URL` in Vercel Project Settings > Environment Variables.
3. Apply migrations to the Neon database in order:
   - `db/migrations/0001-practice-records.sql`
   - `db/migrations/0002-scene-cards.sql`
   - `db/migrations/0003-practice-attempts-and-saved-notes.sql`
   - `db/migrations/0004-saydeck-expressions.sql`
   - `db/migrations/0005-expression-learning-and-export.sql`
4. Redeploy the Vercel project after setting `DATABASE_URL`.

`0001`〜`0003`は旧practice dataの再現性と保全のため保持する。現行UIはこれらを利用しない。

`0004` creates the SayDeck expression capture, sentence variant, audio metadata, and Anki export state tables.

`0005` adds registration timestamps and deterministic Anki indexes. Phase 1以降、DEV browser-speech fallbackは利用しない。

Phase 4のAPKG pathは`SAYDECK_TTS_API_KEY`（または`OPENAI_API_KEY`）と`BLOB_READ_WRITE_TOKEN`を使用する。TTSはWordとExample Sentenceの米国英語音声を内部生成し、private BlobはmediaとAPKGを保存する。browserにはowner認証済みAPKG downloadだけを提供する。

If `DATABASE_URL` is not set, INPUTは未同期の日本語入力をbrowser `localStorage`へ一時退避する。表現のDB保存・LISTS・EXPORTは利用できない。

## Access Rules

- Expression routes redirect to `/signin` unless the user has an accepted GitHub owner session.
- Owner-only actions require GitHub login matching `GITHUB_OWNER`.
- Non-owner login is redirected to `/denied`.
- Expression and export APIs return `401` without an owner session and `503` when required infrastructure is not configured.

## Production OAuth Redirect Check

Use this checklist when Production login reaches `/signin` but does not reach
the learning app after provider authentication.

1. Open `https://scene-builder-tau.vercel.app/api/auth/providers`.
2. Confirm `github` is present.
3. Confirm GitHub callback URL is
   `https://scene-builder-tau.vercel.app/api/auth/callback/github`.
4. Confirm Vercel Production env has these keys set, then redeploy:
   - `NEXTAUTH_URL=https://scene-builder-tau.vercel.app`
   - `AUTH_SECRET`
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_OWNER=kohei321dev`
   - `DATABASE_URL`
   - `OWNER_AI_KEY`
   - `OWNER_AI_MODEL=grok-4.3`
   - `SAYDECK_TTS_API_KEY` (or `OPENAI_API_KEY`)
   - `BLOB_READ_WRITE_TOKEN`
5. Confirm the `/signin` page shows GitHub OAuth as enabled before testing provider login.

## Runtime connection probe

After deploying the current source and applying migrations `0004` and `0005`, sign in as the owner and open the diagnostics panel, or request `GET /api/diagnostics?probe=1`. The probe reports only boolean/status information for the database connection, SayDeck expression schema, and owner AI provider. It never returns `DATABASE_URL`, API keys, raw provider responses, or connection strings.

If the probe reports `Database connection: 未接続`, check the Production `DATABASE_URL` value and Neon network access. If it reports `expression schema: 未適用`, apply `db/migrations/0004-saydeck-expressions.sql` and `db/migrations/0005-expression-learning-and-export.sql`. If it reports `AI connection: 未接続`, check `OWNER_AI_KEY` and `OWNER_AI_MODEL=grok-4.3` in the Production environment.

Do not paste client secrets, tokens, or raw provider error payloads into issues
or docs. If an env value changes in Vercel, redeploy before retesting because
existing deployments do not pick up changed env values.
