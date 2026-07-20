# ADR 0011: Rename to SayDeck

- Status: Accepted
- Date: 2026-07-20
- Supersedes: ADR 0005の製品名・リポジトリ名の決定

> Naming alignment follow-up: the local project directory, npm package, and GitHub repository use the `saydeck` slug. The existing Vercel project keeps the `saydecks` slug as an infrastructure identifier.

## Context

新しい主な利用体験は、場面そのものを組み立てることではなく、思いついた「言いたいこと」を素早く保存し、音声付きAnkiカードへ変換することである。

`SayDeck`は、言いたいことを表す`Say`と、スケートボードおよびAnkiの`Deck`を重ねた名称である。スケートボードを出発点にしながら、日常会話や旅行などの表現にも広げられる。

## Decision

1. 製品の表示名を`SayDeck`とする。
2. local project directoryとnpm package名を小文字の`saydeck`とする。
3. GitHubの既存remoteは`kohei321dev/saydeck`を参照する。GitHub側のrepository renameは別作業とする。
4. 今後作成するAnki note type、deck、tag、media filenameには`SayDeck`または`saydeck`を使う。
5. 現在の本番domain、OAuth callback URL、`NEXTAUTH_URL`は、この名称変更だけでは変更しない。domain変更は別の切替として扱う。
6. 既存のlocalStorage key、DB table、旧Anki artifactに含まれる`scene-builder`識別子は、保存済みデータを失わないために置換しない。必要になった時点で互換読み取りを含む移行を行う。

## Consequences

- UI、metadata、README、現行運用文書、package名をSayDeckへ更新する。
- `Scene Builder ES1Kv2`や`source::scene-builder`は、まだexport実装前の契約のため、`SayDeck ES1Kv2`と`source::saydeck`へ更新する。
- 旧ADR・旧UX文書は当時の判断を残すため、本文やファイル名を一括置換しない。必要な文書には現在名への参照を加える。
- Vercel project名は`saydecks`へ変更済みだが、production domainは旧名称を含む。domainも変更する場合は、新domainの準備、`NEXTAUTH_URL`、GitHub/Google OAuth callback URLの更新、owner login確認を同じ切替で行う。

## Revisit Conditions

- production domainを`SayDeck`に合わせると決めたとき。
- legacy practice UIを削除し、旧localStorage keyを読まなくなったとき。
- 既存Anki packageをexport済みにし、note typeの互換性方針を固定する必要が出たとき。

## References

- `docs/product-brief.md`
- `docs/requirements.md`
- `docs/design.md`
- `docs/specifications/anki-export.md`
- `docs/adr/0005-license-and-project-name.md`
