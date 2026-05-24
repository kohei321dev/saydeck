# ADR 0006: MVP auth prototype

- Status: Proposed
- Date: 2026-05-24

## Context

Scene Builderの最初のMVPでは、URLを知っていても誰でも閲覧できる状態にはしない。GitHub loginで本人だけが閲覧できる状態を作る。

同時に、OAuth credentialが未設定でもUI実装と教材データの確認はローカルで進めたい。

## Decision

Next.js App RouterとNextAuth/Auth.jsのGitHub providerを使う。

- `/api/auth/[...nextauth]` でGitHub OAuth callbackを受ける
- `OWNER_GITHUB_USERNAME=uechikohei` に一致するuserだけトップページを表示する
- 未ログインなら `/signin` へredirectする
- owner以外なら `/denied` へredirectする
- OAuth env未設定なら `/signin?setup=1` へredirectし、必要な環境変数を表示する
- ローカル確認用に `DEV_AUTH_BYPASS=1` を用意する
- `DEV_AUTH_BYPASS` は `NODE_ENV=production` では無効にする

## Consequences

### Positive

- MVP段階で公開URLを作っても、学習画面は本人だけに制限できる
- GitHub OAuth Appのcallback URLが決まればVercel上で動かせる
- OAuth credentialなしでもローカルでUIと教材データを確認できる

### Negative

- GitHub OAuth Appの作成とVercel env設定は手動作業が必要
- owner判定はGitHub login文字列に依存する
- 複数ユーザー対応時はallowlistやDB管理へ拡張が必要

