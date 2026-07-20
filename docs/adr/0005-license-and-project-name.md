# ADR 0005: Project name and license

- Status: Superseded
- Date: 2026-05-24

> Superseded for product and repository naming by `docs/adr/0011-rename-to-saydeck.md` on 2026-07-20. The license decision remains historical context and has not changed.

## Context

このプロジェクトは、個人の英語学習方法をアプリとして公開しやすくするために作る。中心アイデアは、瞬間英作文を拡張し、自分用のシチュエーションに対して短い英文を組み立てること。

当初案の `Scene Speak` は最終成果であるスピーキングに寄っていた。しかし、実際に鍛えたい中核は「話す前に英文を組み立てる力」である。

ライセンスについては、公開しやすいOSS雛形としてMIT Licenseを検討している。一方で、同じものをほぼそのまま有料アプリ化されることには心理的な抵抗がある。

## Decision

project nameは `Scene Builder` とする。

repository nameは `scene-builder` とする。

licenseは初期状態ではMIT Licenseとする。

## Rationale

### Name

`Scene Builder` は、次の意味を持つ。

- `Scene`: シーン、場面、シチュエーション
- `Builder`: 英文回答を組み立てる練習

スケボー専用ではなく、日常会話、旅行、仕事、友人との雑談などにも広げられる。

### License

MIT Licenseは、公開しやすく、利用・改変・再配布がしやすい。学習方法や小さなWebアプリの雛形として共有する目的には合っている。

ただし、MIT Licenseは商用利用や販売を禁止しない。そのため、誰かが似たものを有料サービスとして作ることをlicenseだけで止めたい場合には不向き。

## Alternatives Considered

### AGPL-3.0

Webアプリとして公開された派生版にもソース開示を求めやすい。SaaSとして閉じた形で改変版を提供されることへの抑止にはMITより強い。

一方で、利用者やcontributorsにとっては重く、個人学習ツールの雛形としては採用ハードルが上がる。

### Business Source License / Source-available

商用利用や競合サービス化を制限しやすい。

一方で、一般的なOSSではなくsource-availableになる。公開学習プロジェクトとしての気軽さは下がる。

### No License

著作権上は無断利用しにくくなるが、GitHub公開物としては再利用条件が不明確になる。公開する意味が弱く、他者が安全に参考にしにくい。

## Consequences

### Positive

- GitHubで公開しやすい
- 小さな学習アプリの雛形として使いやすい
- 将来自分で別サービス化する場合も扱いやすい

### Negative

- MIT Licenseでは商用クローンを止められない
- 競合的な有料サービス化を避けたい場合、license見直しが必要
- 外部contributionを受け入れた後にlicense変更する場合、合意や権利整理が必要になる

## Follow-up

AI Review、ユーザー認証、学習ログ保存が入り、サービスとしての独自性が強くなった段階で、MITのままでよいかを再確認する。

商用クローンを避ける優先度が上がった場合は、AGPL-3.0、BSL、Functional Source License、または独自termsを検討する。
