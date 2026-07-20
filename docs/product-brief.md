# Product Brief: SayDeck

- Status: Accepted
- Updated: 2026-07-20

## Product statement

SayDeckは、実際の場面で言いたかったことを日本語で素早く保存し、AIによって自然な英語の学習カードへ変換して、Ankiで継続学習できる個人向けアプリである。

スケートボードの場面を主要な出発点にするが、日常会話、旅行、友人との雑談などにも同じ流れを使える。

## Problem

[事実] 学習者は基礎文法や暗記済みの英文を持っていても、実際に話したい内容をその場で英文に組み立てることが難しい。

[判断] 問題は「教材が少ない」ことよりも、現実の気づきが教材になる前に失われ、復習可能な形で蓄積されないことにある。

## Goal

次の循環を、短時間かつモバイルブラウザから完結させる。

1. 言いたいことに気づく。
2. 日本語で保存する。
3. AIが難易度別の自然な英文候補を作る。
4. 人間が確認・修正し、音声付きカードとして登録する。
5. アプリ内またはAnkiで復習する。

## Primary user and context

- Primary user: 本人（owner）
- Primary device: iOS browser
- Primary timing: スケートボード中、通勤中、日常で表現を思いついた直後
- Primary job: 思いつきを失わず、話せる英文へ変換して復習対象にする

## Core experience

### Quick capture

必須入力は日本語の`言いたいこと`だけにする。AI生成や音声生成の失敗があっても、入力自体は保存される。

### AI-assisted card production

L1〜L4の英文候補、和訳、キーフレーズ、タグ候補を生成し、ユーザーが編集・選択する。長い内容は意味単位に分割し、共通の文脈を保つ。

### Audio and export

登録したvariantにキーフレーズ音声と例文音声を付け、アプリで再生できるようにする。選択カードはAnki互換の音声同梱`.apkg`としてexportする。

## Success measures

- 思いついた日本語を1画面で保存できる。
- AI失敗時も入力が残る。
- 1つの入力から難易度別の候補を比較・編集できる。
- 登録済みカードを音声付きで再生できる。
- 生成したAPKGをAnkiへimportし、再export時に重複しない。

## Product boundaries

- 初期版はowner中心で運用する。
- 直接Anki同期、発音評価、日本語TTS、共同編集、公開deckは扱わない。
- 既存のシーン練習・練習履歴は保持し、新しい教材化機能を段階的に統合する。

## Source of truth

- 要求定義: `docs/requirements.md`
- 設計: `docs/design.md`
- Anki外部仕様: `docs/specifications/anki-export.md`
- 設計判断: `docs/adr/0010-expression-capture-and-anki-export.md`
