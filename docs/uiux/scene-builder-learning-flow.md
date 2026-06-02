# Scene Builder Learning Flow

- Date: 2026-06-02
- Related ADR: `docs/adr/0009-scene-builder-ux-architecture.md`
- Related Interview: `docs/uiux/scene-builder-ux-brainstorming.md`
- Related Issue: #22

## Purpose

Scene Builderの画面を、カード管理ではなく「通勤中にシチュエーションを想像し、自力で英文を作り、AI添削で確認する」体験から組み直す。

この画面構造は、先に実施した `Step 2` の依頼者ヒアリングと、`Step 1` のADRを受けて定義する。

## Primary Use Case

- User: 自分自身
- Device: iOSブラウザ
- Timing: 電車などの通勤中、隙間時間
- Voice: 声は出さない前提が多い
- Job: テーマを軽く選び、シチュエーションだけを見て、選んだ難易度で英文を作る
- Session length: 数分
- Success: 開いた直後にテーマを選べて、1問の回答とAI添削まで迷わず進める

## Current Flow Problem

[事実] 現在の画面には、Decks、Cards、Ownerカード追加、設定診断、詳細目次、場面説明、難易度、回答欄、AI添削、完了/要復習が同居している。

[推測] 学習する前に「どのカードを探すか」「どのデッキを見るか」「Owner機能をどう扱うか」を判断する必要があり、短時間学習には重い。

[判断] 日本語の言いたい文を主表示すると、既存の英訳練習に近づく。今回の価値は、シチュエーションだけを見て自分で会話を作ることに置く。

## Target Screen Map

| Screen | Role | Primary Content | Primary Action | Secondary Actions |
|---|---|---|---|---|
| Mode Switch | 学習/作成の入口 | 学習、作成 | 学習を始める | 作成へ切り替える |
| Learning Mode | 1回の練習 | テーマ、シチュエーション、難易度、回答欄 | AI添削 | ヒント、模範回答、要復習 |
| AI Feedback | 添削結果 | 点数、自然な言い換え | 最新結果を確認 | 任意の修正文、次に足す表現 |
| Creation Mode | 気づきの入力 | ラフな日本語メモ | AIでカード案を作る | テーマ、タグ |
| Creation Preview | 保存前確認 | シチュエーション、ヒント、評価観点 | 保存して学習に追加 | 微修正 |
| Library / Deck | 探す補助 | Deck、カテゴリ、カード一覧、進捗 | カードを練習する | 絞り込み、詳細を見る |

## Target Learning Flow

1. ユーザーがScene Builderを開く
2. `学習` モードで軽くテーマを選ぶ
3. 選んだテーマのシチュエーションが出る
4. ユーザーが難易度を選ぶ
5. ヒントは閉じたまま、自力で回答を書く
6. 必要ならヒントを開く
7. `AI添削` を押す
8. 点数と自然な言い換えを見る
9. 最新回答、最新スコア、最新AI添削結果が保存される

## Target Creation Flow

1. ユーザーが `作成` モードへ切り替える
2. 「このシチュエーションのときなんて言うんだろ」という気づきをラフに入力する
3. AIがカード案を作る
4. ユーザーがシチュエーション、ヒント、難易度別の評価観点を確認/微修正する
5. `保存して学習に追加` を押す
6. 作ったカードが学習モードの出題候補になる

## Difficulty Model

| Level | Purpose | Review Lens |
|---|---|---|
| L1 | 動作を捉える | 動詞や動作を出せているか |
| L2 | 状態を足す | 動詞に加えて、状態や感情を表す形容詞/語句を足せているか |
| L3 | 短く返す | シチュエーションに対して自然な短い返答になっているか |
| L4 | 会話にする | 理由、感想、相手への一言などを入れて会話として使えるか |

L3/L4は固定単語数で合否判定しない。AIが、選んだ難易度に対する成立度を10点満点で返す。

## AI Feedback Output

MVPの結果表示は軽くする。

必須:

- 点数

基本表示:

- 自然な言い換え

任意表示:

- 修正するならこの文
- 次に足すとよい表現

修正文、自然な言い換え、次に足す表現が重複する場合は、重複しない項目だけを表示する。

## Information Hierarchy

### Before

1. Decks / Cards
2. Owner tools
3. Detail TOC
4. Scene detail
5. Practice input
6. AI review / status

### After

1. Mode switch
2. Theme selection
3. Scenario challenge
4. Level selection
5. Answer input
6. AI feedback
7. Creation mode
8. Library / Deck

## First Redesign PR Scope

最初のPRは、全面routing分割ではなく、現在の画面を学習/作成の導線へ寄せる。

### In Scope

- `学習` / `作成` モードを用意する
- 学習モードの入口にテーマ選択を置く
- シチュエーションだけを主表示し、既存の日本語指示は主導線から下げる
- 難易度選択を維持する
- ヒントをデフォルト非表示にする
- AI添削結果を点数中心に軽く表示する
- 最新スコア/最新AI添削結果を `practice_records.review` に保存する
- Ownerカード生成を作成モードへ移す
- Mobileでは1カラム、desktopではLibraryを補助ペインとして扱う

### Out of Scope

- 添削履歴テーブル
- 過去回答/過去スコアUI
- スコア推移グラフ
- 復習間隔アルゴリズム
- 新しい認証方式
- Preview OAuth redirect問題の修正
- PWA/native app化
- 大規模なrouting分割

## cs-aidd / 玉縄 Review Summary

[事実] cs-aidd上で玉縄さんはUI/UX、業務設計、ユーザー価値、画面導線を見る役割として定義されている。

[事実] 依頼者とのヒアリング要約は `docs/uiux/scene-builder-ux-brainstorming.md` に残している。

[判断] このアプリでは、ユーザーに見える価値を「カード分類の充実」ではなく「シチュエーションを想像して自力で回答できること」に置く。

[判断] Deck、詳細TOC、Owner toolsは、学習開始後または探索時に使う補助導線にする。

[判断] 作成モードは、Owner管理UIではなく、自分の気づきを練習素材に変換する入口として扱う。

[補正] 玉縄さんの理想だけで全面改修しない。最初のPRは既存API、保存方式、認証をできるだけ維持し、画面構成と最新AI結果保存を優先する。

## Mobile UX Checklist

- `学習` / `作成` の切り替えが初期表示内にある
- テーマ選択が軽く、カード管理に見えない
- 主要ボタンが指で押しやすい
- Hover前提の操作がない
- 横スクロールがない
- 回答欄にフォーカスしても操作が破綻しない
- ヒントはデフォルト非表示
- 保存中、添削中、エラー時の状態が見える
- カード削除のような危険操作がPrimary CTAの近くにない

## Open Questions

- テーマ候補はカテゴリ由来で十分か、将来ユーザー定義Themeを持つか
- `作成` モードの確認/微修正は、最初のPRでどこまで実装するか
- AI添削履歴は `practice_attempts` として別テーブル化するか
- 完了/要復習の扱いを、AI添削後の次アクションとしてどう見せるか
