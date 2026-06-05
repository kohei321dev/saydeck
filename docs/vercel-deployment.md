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

## Preview OAuth Verification Policy

[事実] GitHub OAuth AppのAuthorization callback URLは完全一致で検証される。

[事実] Vercel Preview URLやdeployment URLはbranch、PR、commitごとに変わる場合がある。そのURLをGitHub OAuth Appへ登録していない場合、GitHub sign-inは `redirect_uri` mismatchで失敗する。

[判断] 既定では、GitHub owner sign-inを含むE2E確認はProduction正式ドメインだけを検証対象にする。

[判断] PR Previewでは、次を確認対象にする。

- buildとVercel deployが成功していること
- 未ログイン時に `/signin` へredirectされること
- OAuth env未設定時にsetup表示へ進めること
- API routeが未認証リクエストを拒否すること
- GitHub owner sign-in後の画面確認は、merge後にProduction正式ドメインで行うこと

PreviewでGitHub owner sign-inまで確認する場合は、次のどちらかを事前に用意する。

1. 固定のstaging/preview domainをVercelで用意し、そのURLだけを検証対象にする。
2. Preview専用GitHub OAuth Appを作成し、Vercel Preview envにPreview専用の `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` / `NEXTAUTH_URL` を設定する。

固定URLを使う場合のcallback URL:

```text
https://<stable-preview-or-staging-domain>/api/auth/callback/github
```

PRごと、commitごとの一時Preview URLをProduction用GitHub OAuth Appへ都度登録しない。Production用OAuth AppはProduction正式ドメイン用として扱う。

## Environment Variables

Set these in Vercel Project Settings > Environment Variables for Production. Add the same values to Preview only if Preview deployments need login and AI review.

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

- Set `NEXTAUTH_URL` to the exact Preview verification URL only when doing authenticated Preview checks.
- Do not copy the Production `NEXTAUTH_URL` into Preview.
- Use separate GitHub OAuth credentials for Preview if the Preview callback URL differs from Production.
- If no stable Preview URL exists, skip GitHub owner sign-in checks in Preview and verify them after merge on the Production domain.

## Neon Postgres Setup

1. Create or connect a Neon project from Vercel Marketplace, or create a Neon database manually.
2. Set `DATABASE_URL` in Vercel Project Settings > Environment Variables.
3. Apply migrations to the Neon database in order:
   - `db/migrations/0001-practice-records.sql`
   - `db/migrations/0002-scene-cards.sql`
4. Redeploy the Vercel project after setting `DATABASE_URL`.

If `DATABASE_URL` is not set, sample cards cannot be loaded from Neon and the app continues to use browser `localStorage` only for practice records.

## Access Rules

- The learning app redirects to `/signin` unless the user has an accepted GitHub or Google session.
- Owner-only actions require GitHub login matching `OWNER_GITHUB_USERNAME`.
- `/api/practice` returns `401` unless the current session is owner.
- `/api/practice` returns `503` if `DATABASE_URL` is not configured.
