# ADR 0007: Architecture decision record workflow

- Status: Proposed
- Date: 2026-05-30

## Context

Scene Builderでは、Next.js、NextAuth、GitHub OAuth、Google OAuth、Grok/xAI、Vercel、DBなど、短い期間に複数の技術判断が発生している。

生成AIとの対話では選択肢の探索が速くなる一方で、前提、要件、実装手段が会話中に変わることがある。判断理由を残さないと、後から「なぜそのサービスを選んだか」「どの制約を優先したか」「何が変わったら見直すか」を再現しにくい。

## Decision

ADR運用ガイドを `docs/ADR.md` に作成し、個別ADRは `docs/adr/NNNN-short-title.md` に集約する。

- 外部サービス、DB、認証、AI API、コスト、運用、secret、privacyに関わる判断はADRを書く
- 実装IssueやPRはADR番号へリンクする
- 最終ゴールが変わらず手段だけ変わった場合は、既存ADRにAddendumを追加する
- 最終ゴールや責務境界が変わる場合は、新規ADRを作り、必要に応じて旧ADRを `Superseded` にする

## Options Considered

### Option A: ADRを `docs/adr/` に集約する

- [事実] 既存ADRがすでに `docs/adr/` にある
- [判断] 小規模リポジトリでは、ADRを集約した方が検索、番号管理、Issueリンクが簡単
- [懸念] 機能別docsから遠くなるため、リンクで補う必要がある

### Option B: `docs/<feature>/decision/ADR.md` に機能ごと分散する

- [判断] 機能単位では読みやすい
- [懸念] 連番、重複、横断判断の追跡が難しい

### Option C: Issue本文だけに判断を書く

- [判断] 起票は速い
- [懸念] 長期的な設計判断の索引として弱い

## Consequences

- 技術判断の理由を後から追える
- 生成AIとの検討で変化した前提を整理しやすい
- IssueとPRが実装作業、ADRが判断記録という責務分離になる
- ADR更新を忘れると、実装と記録がずれる

## References

- `docs/ADR.md`
- 『ソフトウェアアーキテクチャの基礎 第2版』
- 『システム思考の世界へ』
