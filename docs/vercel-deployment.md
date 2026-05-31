# Vercel Deployment

## Auth, AI, Database

[事実] This app uses NextAuth with GitHub OAuth and Google OAuth.

[事実] GitHub sign-in is treated as owner only when the GitHub `login` matches `OWNER_GITHUB_USERNAME`, which defaults to `kohei321dev`.

[事実] Grok review and card generation call xAI from server-side API routes. The browser never receives `XAI_API_KEY` or `GROK_API_KEY`.

[事実] Owner practice records can be stored in Postgres through `DATABASE_URL`. ADR 0008 selects Neon Postgres as the first cloud database target.

## GitHub OAuth App

Create an OAuth App from GitHub Developer Settings.

For production:

- Homepage URL: `https://<your-vercel-domain>`
- Authorization callback URL: `https://<your-vercel-domain>/api/auth/callback/github`

For local development, create a separate OAuth App:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Use the generated Client ID and Client Secret as Vercel env vars.

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

## Neon Postgres Setup

1. Create or connect a Neon project from Vercel Marketplace, or create a Neon database manually.
2. Set `DATABASE_URL` in Vercel Project Settings > Environment Variables.
3. Apply `db/migrations/0001-practice-records.sql` to the Neon database.
4. Redeploy the Vercel project after setting `DATABASE_URL`.

If `DATABASE_URL` is not set, the app continues to use browser `localStorage` for practice records.

## Access Rules

- The learning app redirects to `/signin` unless the user has an accepted GitHub or Google session.
- Owner-only actions require GitHub login matching `OWNER_GITHUB_USERNAME`.
- `/api/practice` returns `401` unless the current session is owner.
- `/api/practice` returns `503` if `DATABASE_URL` is not configured.
