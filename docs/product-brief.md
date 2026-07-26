# Product Brief: SayDeck

- Status: Accepted
- Updated: 2026-07-27

## Product statement

SayDeckは、現実の場面で言いたかったことを日本語で入力し、AIによってAnkiで振り返りやすい英語表現へ変換・整理し、米国英語音声付きAPKGとして書き出す個人向けアプリである。

## Problem

学習者は既知の単語や文法を持っていても、実際の場面で自分の意図を自然な英文として組み立てることが難しい。思いついた内容を一般的な単語帳へ手作業で移すと、場面の文脈と発話意図が失われやすい。

SayDeckの責務はアプリ内学習ではない。現実の気づきを、Ankiで復習できる高品質な英語表現へ変換することである。

## Core experience

### INPUT

ユーザーは`言いたいこと`を日本語で入力する。以前使った主シチュエーションを任意で優先できる。AIは登録済み主分類と照合し、主・副シチュエーション、必要な意味単位、必須の`01_基本表現`、差がある場合だけ任意レイヤーを提案する。ユーザーが分類と候補を確認した時点でDBへ登録する。

### LISTS

保存済み表現を主・副シチュエーション、表現レイヤー、登録日、キーワードで絞り込む。英文・和訳を編集し、不要な入力を一覧から削除し、APKGへ含めるvariantを選ぶ。

### EXPORT

選択した英文を米国英語で読み上げ、`SayDeck::主::副::表現レイヤー`のdeckと5フィールドのSayDeckノートへ投影する。音声とカードは単一APKGへ同梱し、WAVやTSVを個別に扱わせない。

## Success measures

- 日本語入力が通信・DB障害時にも端末へ残る。
- 長い入力を必要な複数意味単位へ分けられる。
- `01_基本表現`は必ず存在し、任意レイヤーは類似文の水増しにならない。
- 主分類は再利用でき、副分類の完全重複には`-001`以降が付く。
- LISTSで英文が読みやすく、編集・削除・絞り込み・export選択ができる。
- Ankiカードの表裏に主・副・表現レイヤーが表示される。
- 表面は英語とen-US音声、裏面は日本語訳だけを表示する。
- 同一variantの再export・再importでカードが重複しない。

## Product boundaries

- 初期版はowner本人向け。
- アプリ内学習、AI添削、採点、復習間隔管理はAnkiの責務とする。
- TSV、CSV、個別WAV、日本語TTS、発音採点、直接Anki同期は対象外。
- 主・副分類を直接管理する専用画面はMVP対象外。
- 初回export後の分類変更による既存Ankiカードのdeck自動移動は保証しない。

## Source of truth

- 要求定義: `docs/requirements.md`
- 設計: `docs/design.md`
- Anki外部仕様: `docs/specifications/anki-export.md`
- UI/DBフロー: `docs/uiux/proposed-situation-first-data-flow.html`
- 現行ADR: `docs/adr/0016-situation-first-expression-and-anki-contract.md`
