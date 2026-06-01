# Scene Builder UX Brainstorming Note

- Date: 2026-06-02
- Related ADR: `docs/adr/0009-scene-builder-ux-architecture.md`
- Related Issue: #22

## Note Policy

このメモは、cs-aiddのロールを使ったUXブレインストーミング結果を、公開repoに置ける形で再構成したもの。

raw chat log、private path、secret、認証情報、長い会話本文は含めない。

## Participants

| Role | Name | Responsibility in this brainstorm |
|---|---|---|
| User / Learner | 自分 | 実際にiOSブラウザで使う学習者 |
| UX / Product Flow | 玉縄さん | ユーザー価値、画面導線、主要CTA、終了体験 |
| Requirements | 直斗 | 目的、制約、成功条件、未確認事項 |
| Product Engineering | 一色 | 最初のPRで切れる実装スライス |
| Architecture Gate | 雪乃 | 長期整合、責務分離、過剰実装の抑制 |

## Starting Prompt

Scene Builderはカード管理ツールではなく、自分が短い英文を作る練習を継続するためのアプリである。

PR #20ではカード探索、デッキ、詳細TOCを追加したが、体験全体としてはまだ「既存画面にUI要素を足した」状態に見える。iOSブラウザで短時間に練習する体験として、何を主導線にすべきかを再検討する。

## Brainstorming Conversation Summary

### 1. What is the user-visible value?

**玉縄さん / UX**

[判断] ユーザーに見える価値は、カードが多いことや分類が整理されていることではない。開いた瞬間に「今日やる練習」が分かり、そのまま回答を書けることが価値。

[判断] デッキや詳細TOCは悪くないが、入口に置きすぎると「勉強する前に探す」体験になる。Primary CTAは1つに絞るべき。

**直斗 / Requirements**

[判断] 成功条件は「画面が便利になった」ではなく、「1回の練習開始と完了まで迷わない」ことに置く。

**Decision impact**

- ADRでは `Practice-first learning flow` を採用する
- `Today / Home` を最初の入口にする
- Deck/TOCは補助導線へ下げる

### 2. Should Deck be the main concept?

**玉縄さん / UX**

[判断] Deckは見た目には整理されていて気持ちよいが、学習アプリとしては「今日やる束」になって初めて価値が出る。カテゴリ名の整理だけでは、練習の開始を助けない。

**雪乃 / Architecture Gate**

[判断] Deckをユーザー作成可能な永続モデルとして先に作ると、DB schema、管理UI、並び順、削除、共有範囲まで論点が広がる。

**一色 / Product Engineering**

[判断] 最初のPRでは、既存のpractice stateから `要復習`, `途中`, `未練習` を出すだけでよい。DeckをDB modelにしない。

**Decision impact**

- Deck-firstは却下
- DeckはSecondary flowとして残す
- 最初のPRではDeckの永続化やユーザー作成機能は入れない

### 3. How should Practice feel on iOS browser?

**玉縄さん / UX**

[判断] iOSブラウザでは、画面上部で迷わせないこと、回答欄を主役にすること、完了ボタンを近くに置くことが重要。

[判断] Hoverや複雑なサイドバーに依存しない。タップ領域、縦スクロール、キーボード表示後の見え方を優先する。

**直斗 / Requirements**

[判断] Primary deviceをiOSブラウザとしてADRに明記する。desktopのサイドバー最適化を主目的にしない。

**Decision impact**

- iOS制約をADRの独立セクションにする
- Mobileでは1カラムを基本にする
- Sidebar/TOCはdesktop補助として扱う

### 4. What happens after the user finishes one practice?

**玉縄さん / UX**

[判断] 完了後の体験が弱いと、ユーザーは次に何をすればよいか分からない。完了、要復習、次のカード、Todayへ戻る導線を終了時に出すべき。

**一色 / Product Engineering**

[判断] 最初は自動遷移せず、完了後に次候補を提示する程度でよい。自動遷移は誤って回答確認前に進むリスクがある。

**Decision impact**

- 完了後のNext actionをUX要件に入れる
- 自動遷移はOpen Questionとして残す

### 5. Where should Owner tools live?

**玉縄さん / UX**

[判断] Owner toolsは重要だが、通常の学習中に見えていると主目的を押し下げる。学習者として使うときは、カード生成や設定診断を見なくてよい。

**雪乃 / Architecture Gate**

[判断] カード削除のような危険操作はPrimary CTAの近くに置かない。誤操作リスクを下げるためにも分離が妥当。

**Decision impact**

- Owner toolsは通常導線から分離する
- 最初のPRでは折りたたみ、別セクション、または別ルート候補として扱う

## Ideas Considered During Brainstorming

| Idea | Summary | Decision |
|---|---|---|
| Workbench UI | 既存の全機能同居画面を整理し続ける | 却下。管理UIにはなるが、学習開始の負荷が下がらない |
| Deck-first UI | Deckを中心にカードを選ぶ | 補助導線として採用。主導線にはしない |
| Today-first UI | 今日の練習、要復習、途中から始める | 採用。最初のUXアーキテクチャにする |
| Practice-only UI | 常に1カードだけ表示する | 保留。集中は強いが探索や復習への戻りが弱い |
| Full route split | `/today`, `/practice`, `/library`, `/owner` に分ける | 後続候補。最初のPRには大きすぎる |

## Final Synthesis

[判断] Scene Builderは、DeckやTOCを中心にした教材管理UIではなく、TodayからPracticeへ入る学習行動中心UIに寄せる。

[判断] 最初のPRでは、データモデルやAPIを変更せず、既存のpractice stateを使って画面構成を変える。

[判断] 玉縄さん観点では、最重要改善は「見た目をCOOLにする」よりも「開いた瞬間に練習開始できる入口と、完了後の次アクションを作る」こと。

## Open Questions from Brainstorming

- `Today` の候補選定は `要復習 > 途中 > 未練習` で十分か
- `完了` 後は次候補を提示するだけか、自動で次カードへ進むか
- Owner toolsは折りたたみで十分か、別ルートへ分けるべきか
- Deckを将来DB modelにするか、当面はpractice state由来の自動分類に留めるか
