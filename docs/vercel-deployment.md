# Vercel Deployment

## Auth, AI, Database

[事実] This app uses NextAuth with GitHub OAuth.

[事実] GitHub sign-in grants `owner` when the GitHub `login` matches `GITHUB_OWNER`, which defaults to `kohei321dev`; other GitHub logins are treated as `viewer`.

[事実] Owner AI calls use `OWNER_AI_KEY` from server-side API routes. Viewer AI review uses `VIEWER_AI_KEY`. The browser never receives either API key.

[事実] Sample scene cards, owner-generated scene cards, and Owner practice records can be stored in Postgres through `DATABASE_URL`. ADR 0008 selects Neon Postgres as the first cloud database target.

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

[判断] Scene BuilderではPR PreviewをUI確認の必須導線から外す。理由は、PR/commitごとに変わるPreview URLとGitHub OAuth callback URLの整合を安全に保ちにくく、Production用secretをPreviewへ持ち込む運用に寄りやすいため。

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
- Confirm the learning app renders at `http://localhost:3000`.
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
- Sign in with a non-owner GitHub account and confirm the account can use the
  viewer learning flow but cannot use owner-only actions.
- If Google OAuth is listed in `/api/auth/providers`, sign in with a guest
  Google account and confirm the intended guest/viewer behavior. If Google is
  not listed, record the item as not applicable for that release rather than
  treating it as a pass.
- Confirm an account that should not have practice access reaches `/denied`.

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
VIEWER_AI_KEY=<viewer-claude-api-key>
VIEWER_AI_MODEL=claude-haiku-4-5-20251001
DATABASE_URL=<neon-postgres-connection-string>
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
4. Redeploy the Vercel project after setting `DATABASE_URL`.

`0003` creates `practice_attempts` and `saved_notes`, which are required for DB-backed practice history and saved notes.

If `DATABASE_URL` is not set, sample cards cannot be loaded from Neon and the app continues to use browser `localStorage` only for practice records, practice attempts, and saved notes.

## Access Rules

- The learning app redirects to `/signin` unless the user has an accepted GitHub session.
- Owner-only actions require GitHub login matching `GITHUB_OWNER`.
- Viewer login can read cards, answer practice prompts, and run AI review with Claude Haiku.
- `/api/practice` returns `401` unless the current session is owner.
- `/api/practice` returns `503` if `DATABASE_URL` is not configured.

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
   - `VIEWER_AI_KEY`
   - `VIEWER_AI_MODEL=claude-haiku-4-5-20251001`
5. Confirm the `/signin` page shows GitHub OAuth as enabled before testing provider login.

Do not paste client secrets, tokens, or raw provider error payloads into issues
or docs. If an env value changes in Vercel, redeploy before retesting because
existing deployments do not pick up changed env values.
