# SayDeck 要求定義

- Status: Accepted
- Date: 2026-07-20
- Related: `docs/product-brief.md`, `docs/design.md`, `docs/specifications/anki-export.md`, `docs/adr/0013-expression-production-and-apkg-only.md`

## 1. 目的と成功条件

### Why

学習者がスケートボード中や日常会話で「こう言いたい」と思った瞬間の日本語を失わず、自然な英語表現へ変換し、Ankiで継続的に振り返れるようにする。

### What

日本語の`言いたいこと`と`シチュエーション`を受け取り、AIがジャンル、シチュエーション、レベルに合う基本ワードと例文を複数生成する。生成結果をAnkiフィールド契約に沿ってDBへ保存し、一覧から選択した表現を米国英語音声付きAPKGとして出力する。

SayDeckの主要機能は次の2つに限定する。

1. 英語表現を生成してDBへ蓄積・整理する。
2. 蓄積した表現をAnki用APKGとしてexportする。

UIはこの責務を`INPUT`、`LISTS`、`EXPORT`の3画面で表現する。

### 成功条件

- iOSブラウザから日本語の言いたいこととシチュエーションをすぐ入力できる。
- 入力がAI失敗や通信失敗で失われない。
- L1〜L4ごとに基本ワードと例文を生成し、Anki用の固定フィールドへ対応付けられる。
- 生成結果をDBへ保存し、ジャンル、シチュエーション、レベル、作成日時で一覧・絞り込み・選択できる。
- ブラウザから、Ankiでimport可能な米国英語音声同梱`.apkg`を取得できる。
- 画面にアプリ内学習、AI添削、TSV、個別WAV生成の導線が表示されない。

## 2. 対象ユーザーと利用文脈

- Primary user: 本人（owner）
- Primary device: iOSブラウザ、必要に応じてdesktop browser
- 利用場面: スケートボード中・移動中・日常で表現を思いついた直後
- セッション: 数十秒で入力、数分でAI生成結果の確認・保存、必要時にAPKG export

初期版では、作成、編集、一覧、Anki exportはownerだけに許可する。共有、共同編集、公開deckは対象外とする。

## 3. 情報設計

| Screen | Route | Responsibility | Primary action |
| --- | --- | --- | --- |
| `INPUT` | `/input` | 日本語入力、AI生成、結果確認、DB保存 | `表現を生成して保存` |
| `LISTS` | `/lists` | 生成済み表現の一覧、検索、絞り込み、編集、export選択 | `選択してEXPORTへ` |
| `EXPORT` | `/export` | 選択条件の確認、APKG生成、download | `APKGを作成` |

- グローバルナビゲーションは上記3項目だけを主要導線として表示する。
- `/`は`/input`へ遷移する。
- `学習`、旧カード、練習履歴、AI添削、Owner deckは現行UIに表示しない。
- `語句音声を生成`、`WAVを生成`、`音声を登録`など、内部処理を利用者へ露出する操作を置かない。

## 4. 機能要件

### FR-1: INPUT

- 必須入力は`言いたいこと（日本語）`と`シチュエーション（日本語）`とする。
- ジャンルは任意入力とし、未指定時はAIが提案する。
- 送信前に入力をブラウザのlocalStorageへ一時退避し、DB保存成功後に消す。
- AIまたはDB保存に失敗した場合は入力を保持し、再試行できる。
- 入力、AI生成、確認・修正、DB保存を1つの連続した画面フローにする。

### FR-2: 難易度別AI生成

- AIは意味単位ごとにL1〜L4の候補を生成する。
- 各候補はAnkiの固定フィールドに対応する構造化データとして返す。
- `keyExpression`を`Word`、`english`を`Example Sentence`として扱う。`Word`は単語1語に限定せず、学習価値のある短い基本フレーズを許容する。
- AIは`Word`、`Definition`、`Irregular Forms`、`Example Sentence`、`Translation`に加えて、ジャンルとシチュエーションタグを返す。
- `Index`、音声field、GUIDはシステムが生成し、AIへ生成させない。
- ユーザーは保存前後に本文、訳、基本ワード、ジャンル、シチュエーションタグを修正できる。
- 生成した候補はDBへ保存し、LISTSで参照可能にする。

| Profile | Purpose | Default constraint |
| --- | --- | --- |
| L1 / Verb focus | 最小限の自然な英文を作る | 1文、3〜8語、主語・動詞・必要な補語を中心にする |
| L2 / Add detail | 状態や細部を加える | 1〜2文、5〜14語、形容詞・副詞・状態表現のいずれかを加える |
| L3 / Reason | 理由・結果・対比を加える | 1〜2文、8〜20語、理由または対比を示す |
| L4 / Conversation | 会話として返す | 1〜2文、8〜24語、質問・誘い・確認などを含める |

### FR-3: 意味単位の分割

- 入力に独立した発話意図が複数ある場合、AIは意味単位の分割案を返す。
- ユーザーは保存前に分割、結合、並べ替えを行える。
- 分割後の表現は同一の親入力に属し、ジャンルとシチュエーションタグを継承する。

### FR-4: LISTS

- DBに保存された生成済み表現を一覧表示する。
- ジャンル、シチュエーション、レベル、作成日時、更新日時、キーワードで絞り込める。
- 複数条件を組み合わせ、件数と選択状態を確認できる。
- 表現を個別または一括選択し、EXPORTへ引き継げる。
- 一覧と詳細から生成内容を確認・修正できる。
- `Deck`は固定の保存単位ではなく、LISTSの絞り込み条件から作る論理的なグループとして扱う。
- 音声の内部状態は、export不能時の理由として必要な場合だけ表示し、個別WAV操作は提供しない。

### FR-5: 米国英語音声

- APKGに含める英語音声は米国英語（`en-US`）として生成する。
- 日本語voiceまたはブラウザ既定voiceへfallbackしてAPKGへ含めてはならない。
- provider、model、voice、locale、speed、formatをserver側で明示し、生成後のmetadataへ保存する。
- 実際の出力が米国英語として聞こえることを、固定fixtureと人間による試聴でrelease gateにする。
- APKG契約で必要な`word_audio`と`sentence_audio`はシステムが内部生成する。ユーザーに音声登録やWAV生成ボタンを操作させない。

### FR-6: APKG Export

- LISTSから選択された表現、または同等の絞り込み条件を対象に`.apkg`を生成する。
- export前に必要な米国英語音声をシステムが生成または再利用し、APKGへ同梱する。
- APKGはnote type、deck、tags、音声mediaを1ファイルに内包する。利用者がWAVを個別に管理する必要はない。
- `Index`、`Word`、`Definition`、`Irregular Forms`、`Example Sentence`、`Translation`、`word_audio`、`sentence_audio`の8フィールドと順序を固定する。
- 固定GUIDと固定model/deck IDにより、同じ表現の再importで重複させない。
- 正式なdownload形式はAPKGのみとし、TSV export UI・APIは提供しない。
- 詳細は`docs/specifications/anki-export.md`を正本とする。

## 5. 非機能要件

- Neon/Postgresを構造化データの正本とする。音声binaryやAPKG binaryをDBへ保存しない。
- 音声とexport artifactはprivate object storageに保存し、認証済みownerだけが取得できる。
- API key、Blob token、raw AI response、入力全文、署名URLをapplication logに出さない。
- AI生成、TTS、Blob保存、APKG生成はそれぞれ再試行可能にする。
- 主要操作はiOSの縦長画面・片手操作・横スクロールなしで完結する。

## 6. 非対象

- アプリ内学習、英作文回答、AI添削、採点、練習履歴、復習キュー
- TSV、CSV、個別WAVのexport
- AnkiWeb、AnkiConnect、AnkiDroid APIとの直接同期
- 日本語音声、発音採点、音声認識
- 自動公開deck、他ユーザー共有、共同編集
- AI生成結果を人間確認なしで自動exportすること

## 7. 既存機能の扱い

- 旧`ScenePractice`、旧カード、review/practice/notes API、学習投影、browser-speech fallback、TSV APIは削除対象とする。
- 旧`scene_cards`、`practice_records`、`practice_attempts`、`saved_notes`のデータとmigrationは、安全な移行・復旧のため当面保持する。
- 旧データを新しい表現domainへ二重書き込みまたは自動投影しない。
- 削除は別Issueで実装し、現行のINPUT・LISTS・EXPORTに必要なデータを巻き込まないことをテストする。

## 8. MVP実装順序

実装は次の順序で行う。後続phaseを先行させない。

1. **Phase 1 — Cleanup**: 旧学習UI・API、学習投影、browser-speech fallback、TSV、手動音声生成導線を削除する。
2. **Phase 2 — INPUT**: 日本語入力からAI生成、確認・修正、Ankiフィールド準拠のDB保存までを完成させる。
3. **Phase 3 — LISTS**: 保存済み表現の一覧、複合filter、論理group、編集、export選択を完成させる。
4. **Phase 4 — EXPORT**: LISTSの選択を受け取り、米国英語音声を内部生成してAPKGだけを出力する。

Phase 1では旧DB tableとmigrationを削除しない。現行expression・認証・APKG実装に必要な依存を誤って削除しないことを確認してから、Phase 2へ進む。
