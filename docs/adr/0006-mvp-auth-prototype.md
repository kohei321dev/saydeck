# ADR 0006: MVP auth and Grok review prototype

- Status: Proposed
- Date: 2026-05-25

## Context

Scene BuilderをVercelへ置く場合、学習画面とAI添削APIを公開URLから誰でも使える状態にはしない。初期MVPではGitHub SSOで本人だけが利用できる状態を作る。

同時に、Grok reviewはxAI API keyをserver-side routeだけで使い、browserへsecretを出さない。

## Decision

Next.js App RouterとAuth.js GitHub providerを使う。

- `/api/auth/[...nextauth]` でGitHub OAuth callbackを受ける
- `OWNER_GITHUB_USERNAME=kohei321dev` に一致するGitHub loginだけを許可する
- 未ログインなら `/signin` へredirectする
- owner以外なら `/denied` へredirectする
- OAuth env未設定なら `/signin?setup=1` で必要な環境変数を表示する
- `/api/review` はowner sessionだけが呼べる
- xAI API keyは `XAI_API_KEY` としてVercel Environment Variablesに置く
- 初期modelは `XAI_MODEL=grok-4.3`
- ローカル確認用に `DEV_AUTH_BYPASS=1` を用意する
- `DEV_AUTH_BYPASS` は `NODE_ENV=production` では無効にする

## Consequences

### Positive

- MVP段階で公開URLを作っても、学習画面とAI reviewを本人だけに制限できる
- GitHub OAuth Appのcallback URLが決まればVercel上で動かせる
- OAuth credentialなしでもローカルでUIと教材データを確認できる
- AI keyをclient bundleへ含めない

### Negative

- GitHub OAuth Appの作成とVercel env設定は手動作業が必要
- owner判定はGitHub login文字列に依存する
- 複数ユーザー対応時はallowlistやDB管理へ拡張が必要
- xAI APIの利用量制限とbilling上限はprovider側で別途管理する必要がある
