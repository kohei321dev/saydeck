# ADR 0009: Scene Builder UX architecture

- Status: Proposed
- Date: 2026-06-02

## Context

Scene Builderの目的は、カードを管理することではなく、スケボーや日常会話の場面で使える短い英文を自分で組み立てる練習を継続すること。

[事実] `docs/product-brief.md` では、学習者が「自分が言いたい内容をその場で英文に組み立てる力」を伸ばすことを中心課題としている。

[事実] PR #20 でカード探索、デッキ風分類、詳細TOC、スクロール連動ナビを追加した。

[事実] 現在の `ScenePractice` は、1つの画面内にカード一覧、デッキ、詳細目次、回答入力、AI添削、クラウド保存状態、Owner向けカード生成、カード削除、設定診断を持っている。

[推測] 現在のUIは機能の入口としては動くが、iOSブラウザで短時間に学習する体験としては、最初の行動を選ぶための認知負荷が高い。

この判断は画面構造、主要導線、Owner機能の配置、後続実装Issueに影響するためADRとして残す。

## Problem Statement

現在のUI改善は「既存画面に便利な部品を足す」方向へ寄っている。Scene Builderが最適化すべき体験は、教材管理ではなく学習行動である。

優先すべき問い:

- iPhoneブラウザで開いた直後、次に何を練習すればよいか分かるか
- カード、デッキ、復習、AI添削、保存状態が学習行動を邪魔していないか
- 1回の練習を完了した後、次の行動が自然に出るか
- Owner向けカード追加や診断が、通常の学習導線に混ざっていないか

## Decision

Scene BuilderのUXアーキテクチャは、`Practice-first learning flow` を採用する。

### Primary user / device / job

- Primary user: 自分自身
- Primary device: iOSブラウザ
- Primary job: 短い英文を作る練習を、迷わず開始して完了する
- Primary flow: 今日の練習 -> 回答 -> 添削/確認 -> 完了/要復習 -> 次の練習
- Secondary flow: カード探索、デッキ閲覧、カード詳細確認
- Owner flow: AIカード生成、カード削除、設定診断

### Information Architecture

1. `Today / Home`
   - 最初に表示する学習入口。
   - 今日やるカード、要復習、最近の進捗、主要CTAだけを置く。
   - Primary CTAは「今日の練習を始める」または「要復習を始める」に寄せる。

2. `Practice`
   - 1カード、1難易度、1回答に集中する画面。
   - 場面、制約、回答欄、模範回答、AI添削、完了/要復習を近い位置にまとめる。
   - 保存状態は補助情報として表示し、主導線にしない。

3. `Library / Deck`
   - カードを探す補助導線。
   - Deckは単なるカテゴリではなく、学習キューとして扱う。
   - 例: `要復習`, `途中`, `Owner deck`, `カテゴリ別`

4. `Card Detail`
   - 場面、模範回答、難易度、履歴を確認する補助画面。
   - 詳細TOCやサイドナビは、詳細情報が長い場合の補助として残す。
   - Primary flowにはしない。

5. `Owner Tools`
   - カード生成、削除、設定診断を通常の学習導線から分離する。
   - 初期表示では折りたたみ、別セクション、または別ルートに寄せる。

### First Implementation Slice

最初の実装PRでは、DB schema、認証、AI添削API、カード保存APIを変更しない。

最小スコープ:

- 現在のトップを `Today / Home` として再構成する
- `Practice` を画面の主役にする
- デッキ/カード一覧を補助導線へ下げる
- Owner向けカード生成と診断を通常の学習導線から分離する
- iOSブラウザで、主要CTAと回答欄が横スクロールなしで扱えることを確認する

## Options Considered

### Option A: 現在のワークベンチ型UIに追加改善する

- [事実] 既存コードを大きく変えずに、目次、サイドバー、カード分類を足せる
- [判断] 管理ツールとしては改善する
- [懸念] 学習開始までの意思決定が減らない
- [結論] Primary architectureとしては採用しない

### Option B: Deck / Library firstにする

- [判断] カード数が増えた場合は探しやすい
- [判断] デッキを学習キューにすれば価値が出る
- [懸念] 開いた直後に「探す」ことが主目的になり、練習開始が遅くなる
- [結論] Secondary flowとして採用する

### Option C: Today / Practice firstにする

- [判断] 最初の行動を「練習する」に固定しやすい
- [判断] iOSブラウザで短時間利用する目的に合う
- [判断] 復習、途中、次のカードを自然に扱える
- [懸念] カード探索やOwner機能は一段奥に移るため、管理操作の発見性は下がる
- [結論] Primary architectureとして採用する

### Option D: 画面を全面的にルーティング分割する

- [判断] `/today`, `/practice/[id]`, `/library`, `/owner` のように責務分離しやすい
- [懸念] 最初のPRとしては変更範囲が大きく、既存の保存/添削状態との接続リスクが高い
- [結論] 後続候補として保留する

### Option E: PWA / native app的に作り直す

- [判断] iOS体験への最適化余地は大きい
- [懸念] 今はWeb/Vercel/Next.jsで十分に検証できる段階
- [結論] 現時点では採用しない

## cs-aidd / 玉縄 Review Note

このADRでは、cs-aiddのUI/UX担当である玉縄さんの観点を、次のレビュー観点として採用する。

ブレインストーミングの過程は `docs/uiux/scene-builder-ux-brainstorming.md` に公開可能な要約として残す。

- ユーザーに見える価値は「カードが整理されていること」ではなく「今日の練習に入れること」
- Primary CTAは1つに絞り、選択肢の多さで学習開始を遅らせない
- デッキ/カテゴリは分類ではなく、次の練習を選ぶための補助にする
- 完了時の体験を設計し、次の練習または要復習への戻り道を明確にする
- iOSブラウザでは、押しやすいタップ領域、縦スクロール中心、横スクロールなし、片手操作を優先する
- ローディング、保存中、添削中、失敗時のフィードバックを見落とさない

ただし、玉縄さんのUX理想だけで最終決定しない。直斗の要件整理、一色の最小実装スライス、雪乃の品質/コスト観点で補正する。

## iOS Browser Constraints

- 主要操作はタップしやすいサイズにする
- Hover前提の導線を置かない
- 回答入力中にキーボードが表示されても主要CTAと文脈が破綻しないようにする
- 横スクロールを発生させない
- Bottom safe areaに近い固定操作を使う場合、入力欄や完了表示を隠さない
- Sidebarはdesktopの補助に留め、mobileではToday/Practice/Libraryの順に縦へ流す

## Consequences

- 学習開始の導線が明確になる
- カード管理UIの優先度が下がる
- Owner向け機能を分離するため、画面構造の整理が必要になる
- PR #20で入れた詳細TOC/デッキは、主役ではなく補助導線として再配置する
- 後続でルーティング分割やpractice queueの永続化が必要になる可能性がある

## Security / Privacy

このADR単体では保存対象を増やさない。

既存の保存対象と方針は ADR 0008 の範囲内に留める。

Owner toolsを通常導線から分離することで、誤操作によるカード生成/削除のリスクを下げる。

## Operations

このADR単体ではVercel環境変数、Neon migration、OAuth callback設定を変更しない。

Preview URLでGitHub SSOのredirect_uri不一致があるため、Preview上の認証動作確認は Issue #21 の解決後に安定させる。

## Revisit Conditions

- カード数が増え、手動のデッキ管理が主目的になる
- 複数ユーザー向けの公開学習サービスへ広げる
- 学習キューや復習間隔をDBで管理する必要が出る
- iOSブラウザではなくnative app/PWAが主利用形態になる
- Ownerとlearnerを別ユーザーとして扱う

## References

- `docs/ADR.md`
- `docs/product-brief.md`
- `docs/adr/0008-neon-postgres-practice-records.md`
- `docs/uiux/scene-builder-ux-brainstorming.md`
- `docs/uiux/scene-builder-learning-flow.md`
- `src/components/scene-practice.tsx`
- Issue #19: カード探索・デッキ・詳細導線を含むUI/UXを改善する
- PR #20: カード探索・デッキ・詳細導線を含むUI/UXを改善する
- Issue #21: Preview URLでGitHub SSOのredirect_uri不一致エラーが発生する
- Issue #22: ADRからScene BuilderのUI/UXアーキテクチャを再設計する
- Apple UI Design Dos and Don'ts: https://developer.apple.com/design/tips/ （確認日: 2026-06-02）
- WCAG 2.2 Understanding SC 2.5.8 Target Size Minimum: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html （確認日: 2026-06-02）
- Nielsen Norman Group, 10 Usability Heuristics for User Interface Design: https://www.nngroup.com/articles/ten-usability-heuristics/ （確認日: 2026-06-02）
