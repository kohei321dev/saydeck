# Scene Builder Learning Flow

- Date: 2026-06-02
- Related ADR: `docs/adr/0009-scene-builder-ux-architecture.md`
- Related Brainstorming: `docs/uiux/scene-builder-ux-brainstorming.md`
- Related Issue: #22

## Purpose

Scene Builderの画面を、カード管理ではなく「短い英文練習を開始し、完了し、次へ戻る」体験から組み直す。

## Primary Use Case

- User: 自分自身
- Device: iOSブラウザ
- Job: 短い英文を1つ書き、必要なら添削し、完了または要復習にする
- Session length: 数分
- Success: 開いた直後に次の練習が分かり、1回の練習を迷わず終えられる

## Current Flow Problem

[事実] 現在の画面には、Decks、Cards、Ownerカード追加、設定診断、詳細目次、場面説明、難易度、回答欄、AI添削、完了/要復習が同居している。

[推測] 学習する前に「どのカードを探すか」「どのデッキを見るか」「Owner機能をどう扱うか」を判断する必要があり、短時間学習には重い。

## Target Screen Map

| Screen | Role | Primary Content | Primary Action | Secondary Actions |
|---|---|---|---|---|
| Today / Home | 学習開始の入口 | 今日の候補、要復習、途中、最近の進捗 | 今日の練習を始める | 要復習へ、Libraryへ |
| Practice | 1回の練習 | 場面、難易度、回答欄、保存状態 | 完了 | 要復習、模範回答、AI添削、リセット |
| Library / Deck | 探す補助 | Deck、カテゴリ、カード一覧、進捗 | カードを練習する | 絞り込み、詳細を見る |
| Card Detail | 確認補助 | 場面、模範回答、難易度、履歴 | このカードを練習する | TOC、関連カード |
| Owner Tools | 管理 | AIカード生成、削除、設定診断 | カードを作る | 診断、削除 |

## Target User Flow

1. ユーザーがScene Builderを開く
2. `Today / Home` に今日の候補と要復習が出る
3. ユーザーは主要CTAから `Practice` に入る
4. `Practice` では1カード1難易度に集中して回答する
5. 必要なら模範回答またはAI添削を見る
6. `完了` または `要復習` を選ぶ
7. 終了時に次のカード、要復習一覧、Todayへ戻る導線を出す

## Information Hierarchy

### Before

1. Decks / Cards
2. Owner tools
3. Detail TOC
4. Scene detail
5. Practice input
6. AI review / status

### After

1. Today CTA
2. Current practice
3. Completion / next action
4. Review queue
5. Library / Deck
6. Owner tools

## First Redesign PR Scope

最初のPRは、全面routing分割ではなく、現在の画面を学習導線へ寄せる。

### In Scope

- 画面上部に `Today / Home` 相当の学習開始領域を作る
- `要復習`, `途中`, `未練習` から次の候補を出す
- `Practice` 領域を主役にし、回答欄と完了操作を近くに置く
- Deck/Card一覧はLibrary補助として主導線の後ろへ下げる
- Ownerカード追加と設定診断を折りたたむ、またはOwner tools領域へ分離する
- Mobileでは1カラム、desktopではLibraryを補助ペインとして扱う

### Out of Scope

- DB schema変更
- 復習間隔アルゴリズム
- 新しい認証方式
- Preview OAuth redirect問題の修正
- PWA/native app化
- 大規模なrouting分割

## cs-aidd / 玉縄 Review Summary

[事実] cs-aidd上で玉縄さんはUI/UX、業務設計、ユーザー価値、画面導線を見る役割として定義されている。

[事実] ブレインストーミングの要約は `docs/uiux/scene-builder-ux-brainstorming.md` に残している。

[判断] このアプリでは、ユーザーに見える価値を「カード分類の充実」ではなく「今日の英文練習へ入れること」に置く。

[判断] Primary CTAを1つに絞る。Deck、詳細TOC、Owner toolsは、学習開始後または探索時に使う補助導線にする。

[判断] 完了後の体験を軽く扱わない。完了、要復習、次のカードを明確に出すことで、1回の練習を終えた記憶と次回への戻りやすさを作る。

[補正] 玉縄さんの理想だけで全面改修しない。最初のPRは既存API、保存方式、認証を維持し、画面構成だけを変える。

## Mobile UX Checklist

- Primary CTAが初期表示内にある
- 主要ボタンが指で押しやすい
- Hover前提の操作がない
- 横スクロールがない
- 回答欄にフォーカスしても操作が破綻しない
- 保存中、添削中、エラー時の状態が見える
- Owner toolsが通常の練習操作を押し下げない
- カード削除のような危険操作がPrimary CTAの近くにない

## Open Questions

- `Today` の候補選定は、初期PRでは「要復習 > 途中 > 未練習」の単純ルールで足りるか
- `Practice` を同一画面内セクションにするか、後続で `/practice/[cardId]` へ分けるか
- Deckをユーザーが作る機能まで広げるか、当面は自動分類だけにするか
- 完了後に次カードへ自動遷移するか、ユーザーに選ばせるか
