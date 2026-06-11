# Vercel Deployment

## Auth, AI, Database

[事実] This app uses NextAuth with GitHub OAuth and Google OAuth.

[事実] GitHub sign-in is treated as owner only when the GitHub `login` matches `OWNER_GITHUB_USERNAME`, which defaults to `kohei321dev`.

[事実] Grok review and card generation call xAI from server-side API routes. The browser never receives `XAI_API_KEY` or `GROK_API_KEY`.

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

[判断] Scene BuilderではPR PreviewをUI確認の必須導線から外す。理由は、PR/commitごとに変わるPreview URLとGitHub/Google OAuth callback URLの整合を安全に保ちにくく、Production用secretやProduction `NEXTAUTH_URL` をPreviewへ持ち込む運用に寄りやすいため。

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

確認URLは `http://localhost:3000` とする。DB / AI / OAuth credentialが必要な範囲は、ローカルでenvを用意した場合だけ確認する。GitHub/Google OAuthの本番確認は、merge後にProduction正式ドメインで行う。

### Preview Deployment Rollback

Preview deploymentを再度使う必要が出た場合は、次を同じ変更単位で実施する。

1. `vercel.json` の `git.deploymentEnabled` から `"*": false` を外すか、対象branch patternを `true` にする。
2. 固定Preview/Staging domainを用意する。
3. Preview専用のGitHub OAuth AppとGoogle OAuth Clientを用意し、callback URLを固定Preview/Staging domainへ向ける。
4. Vercel Preview envにはPreview専用の `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` / `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` / `NEXTAUTH_URL` を設定する。
5. Production用secret、Production `NEXTAUTH_URL`、本番DB write前提をPreviewへコピーしない。

## OAuth Verification Policy

[事実] GitHub OAuth AppのAuthorization callback URLは完全一致で検証される。

[事実] Vercel Preview URLやdeployment URLはbranch、PR、commitごとに変わる場合がある。そのURLをGitHub OAuth Appへ登録していない場合、GitHub sign-inは `redirect_uri` mismatchで失敗する。

[判断] GitHub owner sign-in、Google guest sign-in、未ログインredirect、権限外accountの `/denied` はProduction正式ドメインだけを検証対象にする。

PRごと、commitごとの一時Preview URLをProduction用GitHub OAuth AppやGoogle OAuth Clientへ都度登録しない。Production用OAuth clientはProduction正式ドメイン用として扱う。

## Environment Variables

Set these in Vercel Project Settings > Environment Variables for Production.

```text
AUTH_SECRET=<cryptographically-random-secret>
AUTH_GITHUB_ID=<github-oauth-client-id>
AUTH_GITHUB_SECRET=<github-oauth-client-secret>
OWNER_GITHUB_USERNAME=kohei321dev
AUTH_GOOGLE_ID=<google-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-oauth-client-secret>
GROK_API_KEY=<grok-or-xai-api-key>
GROK_MODEL=grok-4.3
GROK_REASONING_EFFORT=none
DATABASE_URL=<neon-postgres-connection-string>
NEXTAUTH_URL=https://<your-vercel-domain>
```

Do not set `DEV_AUTH_BYPASS` in Vercel Production.

After changing any Vercel environment variable, redeploy. Vercel applies env changes only to new deployments.

For Preview environments:

- Do not copy the Production `NEXTAUTH_URL` into Preview.
- Do not copy Production OAuth secrets into Preview.
- Do not assume Preview has write access to the Production database.
- If Preview deployments are re-enabled later, use a fixed Preview/Staging domain and separate OAuth credentials.

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

- The learning app redirects to `/signin` unless the user has an accepted GitHub or Google session.
- Owner-only actions require GitHub login matching `OWNER_GITHUB_USERNAME`.
- `/api/practice` returns `401` unless the current session is owner.
- `/api/practice` returns `503` if `DATABASE_URL` is not configured.
