# Scene Builder Architecture Diagrams

このディレクトリは、Scene Builder の現時点の全体構成を SVG で可視化する。

## Diagrams

- [01-runtime-overview.svg](./01-runtime-overview.svg): ユーザー利用アクセス、Next.js、Grok API、Neon/Postgres の実行時構成
- [02-auth-and-access.svg](./02-auth-and-access.svg): GitHub OAuth、owner 判定、利用ユーザー ID、ローカル開発 bypass の経路
- [03-delivery-and-operations.svg](./03-delivery-and-operations.svg): GitHub branch strategy、Vercel Production、ローカル検証、将来の修正パッチや定時ジョブの適用点

## Confirmed Facts

[事実] Production は `https://scene-builder-tau.vercel.app`。

[事実] Vercel の自動 deployment は `vercel.json` で `main` のみ有効、その他 branch は無効。

[事実] PR/branch Preview は、GitHub OAuth callback URL と secret 管理の複雑さを避けるため、現時点では必須導線にしない。

[事実] UI 確認は主に local server で行う。代表コマンドは `DEV_AUTH_BYPASS=1 npm run dev`。

[事実] Production の認証は NextAuth + GitHub OAuth。GitHub `login` が `GITHUB_OWNER` と一致した session だけを owner として扱う。

[事実] `DEV_AUTH_BYPASS=1` は `NODE_ENV=production` では無効。

[事実] DB は `DATABASE_URL` 経由で Postgres に接続する。ADR 0008 では Neon Postgres を最初の cloud database target としている。

[事実] Grok/xAI API は server-side API routes から呼び出す。ブラウザへ `GROK_API_KEY` は渡さない。

## Source Files

- `README.md`
- `docs/vercel-deployment.md`
- `vercel.json`
- `src/lib/auth.ts`
- `src/lib/db.ts`
- `src/lib/ai-review.ts`
- `src/lib/ai-card-generation.ts`
- `src/lib/card-store.ts`
- `src/app/page.tsx`
- `src/app/api/review/route.ts`
- `src/app/api/cards/generate/route.ts`
- `src/app/api/cards/route.ts`
- `src/app/api/practice/route.ts`
- `db/migrations/*.sql`

## Notes For Future Changes

[判断] 定時ジョブや全体適用の修正パッチを追加する場合は、まず `main` へ merge される CI/CD 経路と Production env / DB migration の境界を確認する。

[判断] Preview/Staging を再導入する場合は、固定 domain、専用 OAuth App、専用 secret、DB write 範囲を同じ変更単位で再設計する。
