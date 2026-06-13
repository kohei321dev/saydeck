# UI/UX Persona Meeting Log: Tamanawa

- Date: 2026-06-13
- Agent: codex
- Repository: `scene-builder`
- Topic: Scene Builder UI/UX redesign, persona target, browser/mobile learning flow
- Related issue: #44 `uiux: 学習/作成切替と余白設計のモックレビューを行う`
- Parent issue: #22 `ADRからScene BuilderのUI/UXアーキテクチャを再設計する`

## Purpose

Scene Builder の UI/UX 再設計について、Persona Skills の UI/UX 担当レビュワー「玉縄さん」と会話形式で論点を整理する。

後続で ADR へ反映するため、会話の生ログに近い形で残す。ただし secret、private URL、raw runtime state は含めない。

## Context

[事実] ユーザーは、実カレンダーの会議ではなく、Persona Skills に定義された UI/UX 担当レビュワーとしての「玉縄さん」と会話形式で検討したい、と訂正した。

[事実] 既存 issue として #22 が UI/UX アーキテクチャ再設計の親 issue、#44 が学習/作成切替と余白設計のモックレビュー issue として作成済み。

[事実] 現行 UI の主な対象は `ScenePractice`、`ActiveMode = "learn" | "create"`、`.mode-hero`、`.mode-tabs`、`.mode-tab`、`.practice-main`、`.creation-main`。

## Meeting Setup

Participants:

- User: product owner / primary learner
- Tamanawa: Persona Skills UI/UX reviewer, focused on user value, flow, visible UI quality
- Codex: facilitator / note taker / issue and ADR bridge

## Conversation Log

### User

> いやごめん玉縄さんはpersona-skill-core-koheiに定義しているエンジニアレビュワーのUIUX担当のことです。この人の意見を聞きたいので、会話形式で進めていきたいという感じ

### Codex

> 了解です。実カレンダーではなく、Persona Skills の玉縄さんを UI/UX レビュワーとして呼ぶ会話MTGですね。ではこの場で始めます。

### Codex: Meeting Framing

会話MTG: Scene Builder UI/UX

Participants:

- User: product owner / learner
- Tamanawa: UI/UX and business-flow reviewer
- Codex: discussion facilitator / issue bridge

### Tamanawa

> じゃあまずカスタマーサイドの目線からアジェンダを置くね。今回のポイントは、単に余白を減らすことじゃなくて、ユーザーがブラウザでもモバイルでも「次に何をすればいいか」を迷わないエクスペリエンスにすることだと思うんだよね。
>
> 僕が最初に確認したいのはこの5つかな。

#### Question 1: Main Target

Scene Builder の primary user は、今は「上地さん本人」で固定してよいか。

それとも、将来的に URL を知っている他の英語学習者も想定するか。

#### Question 2: Usage Scene

Mobile usage is expected to be:

- 3 to 5 minutes before/after skateboarding or while moving
- or 15 to 30 minutes while sitting at a desk

#### Question 3: First View Primary Action

When the user opens the app, which action should be most prominent?

- Start today's practice
- Continue from last time
- Review needed items
- Search cards
- Create a new card

#### Question 4: Relationship Between Learn And Create

Should `Create` always sit beside the learning experience?

Or should it be treated as an owner tool that usually stays deeper in the UI and does not interrupt learning?

#### Question 5: Motivation

What kind of UI increases learning motivation for this product?

- Today's work feels small and approachable
- Completion progress is visible
- AI review makes improvement visible
- Skateboarding scenes feel realistic
- It does not feel like a management/admin screen

### Tamanawa: Initial Direction

> ここを先にコンセンサス取ると、`.mode-hero` と `.mode-tabs` をどうブラッシュアップするか、かなりバリューを出せると思うんだよね。

### User

> この会話logs/などを切って、保存しておいて～。ADRにこの生ログを使って反映したうぃので、後ほど

## Open Questions

1. Primary user は「自分専用」か、「URL を知る他学習者」も初期設計に含めるか。
2. Mobile の主利用シーンは短時間練習か、机上のまとまった練習か。
3. First view の primary action は何にするか。
4. `Create` は常時表示か、owner tool として分離するか。
5. 学習モチベーションを上げる最重要要素は何か。

## Follow-up Conversation

### User

> 上地本人で固定してOKです。
>
> 電車通勤や移動時間などの合間でOKです。
> 机にがっつりではない。将来的にそのモードが会ってもよいくらい
>
> 今日の練習を始めるですね
>
> ひらめきや言いたいことがあったふとした瞬間なので、UIに浮き出てアイコンとかで、どのページからもそのアイコンクリックしたらモーダル表示で登録できたりすると体験はよさそう

## Current Answers

1. Primary user: 上地本人で固定する。
2. Primary usage scene: 電車通勤や移動時間などの合間。机に向かう長時間学習は主導線にしないが、将来モードとしてはあり得る。
3. First view primary action: 今日の練習を始める。
4. Create relationship: 常設の大きなタブではなく、ひらめきや言いたいことが出た瞬間にどこからでも開ける floating icon / modal 形式が合いそう。
5. Motivation: 完了が積み上がって見えること、AI添削で成長が見えること、スケボー場面がリアルに想像できること、余計な管理画面っぽさがないこと。

### User

> 完了が積み上がって見える
> - AI添削で成長が見える
> - スケボー場面がリアルに想像できる
> - 余計な管理画面っぽさがない
>
> これらはモチベーションになる

## ADR Candidate Notes

[判断候補] UI/UX ADR では、余白削減を目的にせず、first view の主行動、学習/作成の責務分離、mobile usage scene を先に決める。

[判断候補] `.mode-hero` / `.mode-tabs` の変更は、コンポーネント単位の局所 CSS issue ではなく、primary user / primary action が決まった後の子 issue として扱う。

[判断候補] Primary user は上地本人、primary device / scene は移動中のスマートフォン短時間利用とする。desktop は管理や深い編集の補助導線として扱う。

[判断候補] First view の primary CTA は「今日の練習を始める」に寄せる。作成機能は上部タブで学習と同格に置かず、floating action または global quick capture として設計する。

[判断候補] Motivation model は、progress visibility、AI feedback visibility、realistic skate scene immersion、non-admin feel の4点を中心に置く。

[未検証] 具体的な UI モック案、スクリーンショット、mobile 実機確認はまだ未実施。

## Resume Conversation

### User

> 1回開いたら 1シーンだけ 練習するが良いですね

## Updated Direction

[判断候補] 1セッションの主単位は「1シーンだけ練習する」とする。開いた直後に多数のデッキ、カード一覧、管理操作を選ばせるのではなく、今日の1シーンへ進む導線を最短にする。

[判断候補] 「今日の練習を始める」は、1問セットや長い学習開始ではなく「1シーンを開く」意味に寄せる。AI添削、保存、完了表示までを1シーン完結の成功体験として扱う。

[判断候補] 完了の積み上げは、長時間学習の進捗バーではなく「今日1シーンできた」「最近の完了が増えている」程度の軽い達成感として見せる。

### User

> 未完了優先でいきましょう
>
> もう一つやるを出す

## Confirmed Micro Flow

[事実] 今日の1シーン候補は「未完了優先」で選ぶ。既に完了したカードや難易度より、まだ完了していない練習を先に出す。

[事実] 1シーン完了後には「もう一つやる」を出す。1シーン完結を基本にしつつ、続けたいときだけ自然に次へ進める。

[判断候補] First view は「未完了の1シーン」を主表示し、Deck / Library は補助導線に下げる。ユーザーが最初にカード探索をしなくても練習を開始できる状態を目標にする。

[判断候補] 完了後の画面は、主メッセージを「今日1シーン完了」にし、secondary action として「もう一つやる」を置く。これにより、短時間利用の完了感と、続けたい時の連続練習を両立する。

[未検証] 未完了優先の選出単位は「カード単位」か「カード x 難易度単位」か、実装前に決める必要がある。現在の保存キーは `cardId + level` のため、MVPでは「カード x 難易度単位」の未完了を自然に扱える可能性が高い。
