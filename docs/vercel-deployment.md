# Vercel Deployment

## Auth and AI Runtime

[事実] This app uses Auth.js with GitHub OAuth. Sign-in is accepted only when the GitHub `login` matches `OWNER_GITHUB_USERNAME`, which defaults to `kohei321dev`.

[事実] Grok review calls xAI from the server-side `/api/review` route. The browser never receives `XAI_API_KEY`.

## GitHub OAuth App

Create an OAuth App from GitHub Developer Settings.

For production:

- Application name: `Scene Builder`
- Homepage URL: `https://<your-vercel-domain>`
- Authorization callback URL: `https://<your-vercel-domain>/api/auth/callback/github`

For local development, create a separate OAuth App:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Use the generated Client ID and Client Secret as Vercel env vars.

## Vercel Project

1. Import `kohei321dev/scene-builder` into Vercel.
2. Framework Preset: `Next.js`
3. Build Command: `npm run build`
4. Install Command: `npm install`
5. Output Directory: keep Vercel default.

## Environment Variables

Set these in Vercel Project Settings > Environment Variables for Production. Add the same values to Preview only if Preview deployments need login and AI review.

```text
AUTH_SECRET=<cryptographically-random-secret>
AUTH_GITHUB_ID=<github-oauth-client-id>
AUTH_GITHUB_SECRET=<github-oauth-client-secret>
OWNER_GITHUB_USERNAME=kohei321dev
XAI_API_KEY=<xai-api-key>
XAI_MODEL=grok-4.3
```

Do not set `DEV_AUTH_BYPASS` in Vercel Production.

Generate `AUTH_SECRET` locally with one of these commands and paste only the value into Vercel:

```bash
npm exec auth secret
```

or:

```bash
openssl rand -base64 33
```

After changing any Vercel environment variable, redeploy. Vercel applies env changes only to new deployments.

## Local Development Env

Create `.env.local` locally with the same keys. Do not commit it.

```text
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
OWNER_GITHUB_USERNAME=kohei321dev
XAI_API_KEY=
XAI_MODEL=grok-4.3
DEV_AUTH_BYPASS=1
```

## Access Rules

- The learning app redirects to `/signin` unless the GitHub session is the allowed owner.
- GitHub OAuth sign-in is rejected unless the GitHub login is `kohei321dev`.
- `/api/review` returns `401` unless the current Auth.js session is the allowed owner.
- `/api/review` returns `503` if `XAI_API_KEY` is not configured.
