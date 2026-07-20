# ADR 0009: Scene Builder UX architecture

- Status: Superseded
- Date: 2026-06-02

> Superseded in part by `docs/adr/0010-expression-capture-and-anki-export.md` on 2026-07-20. The existing Practice-first learning flow remains historical context, while expression capture, audio, and Anki export now have independent UI and data boundaries.

> Historical terminology: this ADR uses the product name at the time. The current product name is `SayDeck`; see `docs/adr/0011-rename-to-saydeck.md`.

## Context

Scene Builderの目的は、カードを管理することではなく、スケボーや日常会話の場面で使える短い英文を自分で組み立てる練習を継続すること。

[事実] このADRは、先に `docs/uiux/scene-builder-ux-brainstorming.md` で依頼者本人とのUXヒアリングを行い、cs-aidd / 玉縄さん観点で整理した結果を設計判断として残すもの。

[事実] 依頼者は、通勤中や電車内などの隙間時間にiOSブラウザから開いて使う想定。

[事実] 電車内では声を出せない場面が多い。

[事実] 依頼者は、最初に軽くテーマを選び、シチュエーションだけを見て自分で回答したい。

[事実] PR #20 でカード探索、デッキ風分類、詳細TOC、スクロール連動ナビを追加した。

[事実] 現在の `ScenePractice` は、1つの画面内にカード一覧、デッキ、詳細目次、回答入力、AI添削、クラウド保存状態、Owner向けカード生成、カード削除、設定診断を持っている。

[推測] 現在のUIは機能の入口としては動くが、iOSブラウザで短時間に学習する体験としては、最初の行動を選ぶための認知負荷が高い。

この判断は画面構造、主要導線、作成モード、AI添削結果保存、後続実装Issueに影響するためADRとして残す。

## Problem Statement

現在のUI改善は「既存画面に便利な部品を足す」方向へ寄っている。Scene Builderが最適化すべき体験は、教材管理ではなく学習行動と自分専用シチュエーション作成の循環である。

優先すべき問い:

- 通勤中のiOSブラウザで、声を出さずに直感的に練習できるか
- 最初に軽くテーマを選び、シチュエーションだけを見て自分で回答を作れるか
- 難易度を自分で選び、その難易度に対するAI添削を受けられるか
- ヒントや模範回答が、最初から答えを見せすぎていないか
- 作成モードで日常の気づきを練習カードへ変換し、学習モードへ戻せるか

## Decision

Scene BuilderのUXアーキテクチャは、`Theme -> Scenario -> Challenge -> AI feedback` を中心にした `Practice-first learning flow` を採用する。

実行順は `Step 2 -> Step 1 -> Step 3 -> Step 4` とする。まず依頼者ヒアリングでユーザー価値を定義し、その後ADR、画面構造、最小実装PRへ進める。

### Primary user / device / job

- Primary user: 自分自身
- Primary device: iOSブラウザ
- Primary job: 声を出せない隙間時間でも、シチュエーションを想像して短い英文を作る
- Primary flow: テーマ選択 -> シチュエーション出題 -> 難易度選択 -> 自力回答 -> AI添削 -> 最新結果保存
- Secondary flow: ヒント表示、模範回答確認、カード探索、デッキ閲覧
- Creation flow: ラフな日本語の気づき -> AIカード案生成 -> 確認/微修正 -> 保存して学習に追加

### Information Architecture

1. `Mode Switch`
   - `学習` と `作成` を切り替える。
   - Ownerのカード生成は管理機能ではなく、作成モードとして扱う。

2. `Learning Mode`
   - テーマを軽く選ぶ。
   - シチュエーションだけを主表示する。
   - 難易度はユーザーが選ぶ。
   - ヒントはデフォルト非表示にし、必要なときだけ開く。
   - `AI添削` を主要アクションにする。

3. `AI Feedback`
   - 10点満点は英語力そのものではなく、選んだ難易度に対する成立度として扱う。
   - 必須表示は点数。
   - 自然な言い換えを基本表示する。
   - 修正文と次に足す表現は、重複せず必要な場合だけ表示する。
   - MVPでは最新回答、最新スコア、最新AI添削結果を保存する。

4. `Creation Mode`
   - 「このシチュエーションのときなんて言うんだろ」という気づきをラフに入力する。
   - AIがテーマ、シチュエーション、ヒント用の動詞/形容詞/表現、難易度別の評価観点を作る。
   - 保存前に確認/微修正する。
   - 保存後に学習モードの出題候補へ入る。

5. `Library / Deck`
   - カードを探す補助導線。
   - Deckは単なるカテゴリではなく、学習キューとして扱う。
   - 例: `要復習`, `途中`, `Owner deck`, `カテゴリ別`

6. `Card Detail`
   - 場面、模範回答、難易度、履歴を確認する補助画面。
   - 詳細TOCやサイドナビは、詳細情報が長い場合の補助として残す。
   - Primary flowにはしない。

### Difficulty Model

難易度はAIが事後判定するものではなく、ユーザーが選ぶ練習モードとする。

- `L1`: 動詞や動作を出せているか
- `L2`: 動詞に加えて、状態や感情を表す形容詞/語句を足せているか
- `L3`: シチュエーションに対して自然な短い返答になっているか
- `L4`: 会話として使える返答になっているか。理由、感想、相手への一言などが入っているか

L3/L4は固定の単語数で合否判定しない。AIが選択難易度に対する成立度を評価する。

### First Implementation Slice

最初の実装PRでは、DB schema、認証、カード保存APIを変更しない。

最小スコープ:

- `学習` / `作成` のモード切り替えを作る
- 学習モードでテーマ選択を入口にする
- シチュエーションだけを主表示する
- 難易度をユーザーが選べる状態を維持する
- ヒントをデフォルト非表示にする
- AI添削結果を点数中心の軽い表示にする
- 最新スコア/最新AI添削結果を既存 `practice_records.review` に保存する
- デッキ/カード一覧を補助導線へ下げる
- Owner向けカード生成を作成モードへ移す
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
- [懸念] 依頼者は、アプリ側が今日の1枚を一方的に出すより、最初に軽くテーマを選びたい
- [結論] `Theme -> Scenario -> Challenge` に修正して採用する

### Option D: Theme -> Scenario -> Challengeにする

- [事実] 依頼者は通勤中にiOSブラウザで使い、声を出せない場面が多い
- [事実] 依頼者は最初に軽くテーマを選びたい
- [事実] 依頼者は日本語文の英訳ではなく、シチュエーションだけを見て自分で回答したい
- [判断] 既存の英訳練習アプリとの差別化が明確になる
- [結論] Primary architectureとして採用する

### Option E: 画面を全面的にルーティング分割する

- [判断] `/learn`, `/create`, `/library` のように責務分離しやすい
- [懸念] 最初のPRとしては変更範囲が大きく、既存の保存/添削状態との接続リスクが高い
- [結論] 後続候補として保留する

### Option F: PWA / native app的に作り直す

- [判断] iOS体験への最適化余地は大きい
- [懸念] 今はWeb/Vercel/Next.jsで十分に検証できる段階
- [結論] 現時点では採用しない

## cs-aidd / 玉縄 Review Note

このADRでは、依頼者とのヒアリングを前提に、cs-aiddのUI/UX担当である玉縄さんの観点を次のレビュー観点として採用する。

ヒアリングの過程は `docs/uiux/scene-builder-ux-brainstorming.md` に公開可能な要約として残す。

- ユーザーに見える価値は「カードが整理されていること」ではなく「シチュエーションを想像して自力で回答できること」
- 最初の選択肢は重いDeck管理ではなく、軽いテーマ選択にする
- AI添削は英語力評価ではなく、選択難易度に対する成立度として出す
- 作成モードを用意し、日常の気づきが学習モードへ戻る循環を作る
- iOSブラウザでは、押しやすいタップ領域、縦スクロール中心、横スクロールなし、片手操作を優先する
- ローディング、保存中、添削中、失敗時のフィードバックを見落とさない

ただし、玉縄さんのUX理想だけで最終決定しない。直斗の要件整理、一色の最小実装スライス、雪乃の品質/コスト観点で補正する。

## iOS Browser Constraints

- 主要操作はタップしやすいサイズにする
- Hover前提の導線を置かない
- 回答入力中にキーボードが表示されても主要CTAと文脈が破綻しないようにする
- 横スクロールを発生させない
- Bottom safe areaに近い固定操作を使う場合、入力欄や完了表示を隠さない
- Sidebarはdesktopの補助に留め、mobileでは学習モード、作成モード、Libraryの順に縦へ流す

## Consequences

- 通勤中に声を出せない前提でも学習しやすくなる
- 日本語文の英訳ではなく、シチュエーション想像型の実践練習へ寄る
- カード管理UIの優先度が下がる
- 作成モードをプロダクトの一部として扱うため、画面構造の整理が必要になる
- PR #20で入れた詳細TOC/デッキは、主役ではなく補助導線として再配置する
- 後続で履歴テーブル、スコア推移UI、ルーティング分割が必要になる可能性がある

## Security / Privacy

MVPでは、最新回答、最新スコア、最新AI添削結果を保存する。

既存 `practice_records.review` を使い、DB schema変更は行わない。

Post-MVPでAI添削実行ごとの履歴を扱う場合は、`practice_attempts` のような履歴テーブルを別途検討する。

作成モードではラフな日本語の気づき、AI生成カード案、ヒント、難易度別評価観点を扱う。secret、raw provider response、private URLは保存しない。

## Operations

このADR単体ではVercel環境変数、Neon migration、OAuth callback設定を変更しない。

PR PreviewはUI確認の必須導線にしない。Issue #34 の方針に従い、PR作成前後のUI確認はローカルサーバーで行い、GitHub/Google OAuthの本番確認はProduction正式ドメインで行う。

## Revisit Conditions

- カード数が増え、手動のデッキ管理が主目的になる
- 複数ユーザー向けの公開学習サービスへ広げる
- AI添削実行ごとの履歴、スコア推移、復習間隔をDBで管理する必要が出る
- iOSブラウザではなくnative app/PWAが主利用形態になる
- 作成者と学習者を別ユーザーとして扱う

## References

- `docs/ADR.md`
- `docs/product-brief.md`
- `docs/adr/0008-neon-postgres-practice-records.md`
- `docs/uiux/scene-builder-ux-brainstorming.md`
- `docs/uiux/scene-builder-learning-flow.md`
- `src/components/scene-practice.tsx`
- Issue #34: PR PreviewをUI確認の前提から外す運用へ切り替える
- Issue #19: カード探索・デッキ・詳細導線を含むUI/UXを改善する
- PR #20: カード探索・デッキ・詳細導線を含むUI/UXを改善する
- Issue #22: ADRからScene BuilderのUI/UXアーキテクチャを再設計する
- Apple UI Design Dos and Don'ts: https://developer.apple.com/design/tips/ （確認日: 2026-06-02）
- WCAG 2.2 Understanding SC 2.5.8 Target Size Minimum: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html （確認日: 2026-06-02）
- Nielsen Norman Group, 10 Usability Heuristics for User Interface Design: https://www.nngroup.com/articles/ten-usability-heuristics/ （確認日: 2026-06-02）
