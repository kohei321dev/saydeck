# SayDeck 要求定義

- Status: Accepted
- Date: 2026-07-20
- Related: `docs/product-brief.md`, `docs/design.md`, `docs/specifications/anki-export.md`, `docs/adr/0010-expression-capture-and-anki-export.md`

## 1. 目的と成功条件

### Why

学習者が実際のスケートボード中や日常会話で「こう言いたい」と思った瞬間に、その気づきを失わず、自然な英語表現とAnki学習カードへ変換できるようにする。

### What

日本語で表現を入力し、AIで難易度別の英文候補を作り、人間が確認して音声付きカードとして保存・再生・Anki exportできる個人学習アプリにする。

### 成功条件

- iOSブラウザを含む任意の画面から、1つの日本語入力をすぐ保存できる。
- 入力がAI失敗や通信失敗で失われない。
- L1〜L4の英文候補を編集・選択できる。
- 長い内容は意味を壊さない分割案として確認でき、分割カードに共通タグが引き継がれる。
- 登録済みカードはキーフレーズ音声と例文音声をアプリ内で再生できる。
- ブラウザから、Ankiでimport可能な音声同梱`.apkg`を取得できる。

## 2. 対象ユーザーと利用文脈

- Primary user: 本人（owner）
- Primary device: iOSブラウザ、必要に応じてdesktop browser
- 利用場面: スケートボード中・移動中・日常で表現を思いついた直後
- セッション: 数十秒で入力保存、数分でAI生成・確認・登録

初期版では、作成、音声再生、Anki exportはownerだけに許可する。共有、共同編集、公開deckは対象外とする。

## 3. 機能要件

### FR-1: Quick Capture

- すべての主要画面から`表現を作る`へ移動できる。
- 必須入力は`言いたいこと（日本語）`だけとする。
- `場面（日本語）`、ジャンル、シチュエーションタグは任意入力とし、AIが候補を提案する。
- 送信前にブラウザのlocalStorageへ一時退避し、Neonへの保存成功後に消す。
- オフラインまたは保存失敗時は`未同期`として残し、次回起動または再試行時に同期する。

### FR-2: 難易度別AI生成

- 保存済み入力から、各意味単位についてL1〜L4の英文・和訳・キーフレーズを生成する。
- `keyExpression`をAnkiの`Word`、`english`を`Example Sentence`として扱う。`Word`は単語1語に限定せず、学習価値のある短いキーフレーズを許容する。
- AIは、英文、和訳、キーフレーズ、キーフレーズの日本語の意味、不規則変化、制約根拠を構造化データで返す。
- ユーザーは生成後に英文、和訳、キーフレーズ、タグを編集できる。
- 語数と文数はサーバーで検証する。品詞・会話要素はAIの根拠表示と人間確認を併用する。

| Profile | Purpose | Default constraint |
| --- | --- | --- |
| L1 / Verb focus | 最小限の自然な英文を作る | 1文、3〜8語、主語・動詞・必要な補語を中心にする |
| L2 / Add detail | 状態や細部を加える | 1〜2文、5〜14語、形容詞・副詞・状態表現のいずれかを加える |
| L3 / Reason | 理由・結果・対比を加える | 1〜2文、8〜20語、理由または対比を示す |
| L4 / Conversation | 会話として返す | 1〜2文、8〜24語、質問・誘い・確認などを含める |

- L1〜L4の語数、文数、必須要素、AI指示はowner用設定画面で変更できる。
- `主語と動詞のみ`は、文法的に不自然な二語文ではなく、修飾を抑えた最小の文として扱う。

### FR-3: 意味単位の分割

- 生成文がプロファイルの最大語数・文数を超える、または入力に独立した発話意図が複数ある場合、AIは意味単位の分割案を返す。
- ユーザーは保存前に分割、結合、並べ替えを行える。
- 分割後のカードは同一の親入力に属し、ジャンルとシチュエーションタグを継承する。
- 分割・結合で意味単位が変わった場合、その単位のAI候補を再生成する。

### FR-4: タグとカード状態

- 1つの入力にジャンル1件とシチュエーションタグ0件以上を保存する。
- 難易度はvariantごとにL1〜L4として保存し、Anki export時にタグ化する。
- 生成した全variantはDBへ保存する。音声化・exportするvariantはユーザーが選ぶ。
- variantの状態は`draft`、`approved`、`audio_ready`、`audio_failed`、`stale`、`archived`とする。

### FR-5: 音声登録と再生

- `approved` variantを登録すると、キーフレーズと英語例文全文の2音声を生成する。
- 音声は米国英語として生成し、既定値はOpenAI互換Speech APIの`tts-1`、`alloy`、speed `1.0`、WAVとする。providerはserver-side adapterとして差し替え可能にする。
- 音声binaryはprivate object storageへ保存し、DBにはprovider、model、voice、speed、format、hash、path、statusだけを保存する。
- 2音声の保存が完了したvariantだけを`audio_ready`にする。
- 本文、voice、model、速度、formatが変わった音声は`stale`にし、再登録時に再生成する。
- Libraryでは音声状態と再生操作を表示する。MVPの失敗時はWordとExample Sentenceの2音声を1組として再試行する。

### FR-6: Anki Export

- `audio_ready` variantを任意選択し、`.apkg`としてexportする。
- exportは音声、note type、deck、tagsを同梱する。
- `Index`、`Word`、`Definition`、`Irregular Forms`、`Example Sentence`、`Translation`、`word_audio`、`sentence_audio`の8フィールドと、その順序を固定する。
- exportは同じvariantを再度importしたときに重複しないよう、固定GUIDと固定model/deck IDを使用する。
- Anki contractの詳細は`docs/specifications/anki-export.md`を正本とする。

TSVはAPKGの代替ではない。フィールド確認やテキストバックアップの補助形式としてだけ提供し、音声付き学習カードの正式なdownload形式にはしない。

## 4. 非機能要件

- Neon/Postgresを構造化データの正本とする。音声binaryやAPKG binaryをDBへ保存しない。
- 音声とexport artifactはprivate object storageに保存し、認証済みownerだけが取得できる。
- API key、Blob token、raw AI response、入力全文、署名URLをapplication logに出さない。
- AI生成、TTS、Blob保存、APKG生成はそれぞれ再試行可能で、片方の失敗で入力や確定済み本文を失わない。
- 主要操作はiOSの縦長画面・片手操作・横スクロールなしで完結する。

## 5. 非対象

- AnkiWeb、AnkiConnect、AnkiDroid APIとの直接同期
- 日本語音声、発音採点、音声認識
- 自動公開deck、他ユーザー共有、共同編集
- AI生成結果を人間確認なしで自動exportすること
- 既存`scene_cards`、練習履歴、保存ノートの一括移行・削除

## 6. DEV検証済みの追加スライス

- `registered`の表現カードは既存の学習モードから選択でき、既存の練習履歴へ保存する。
- AI生成レスポンスからジャンルslugとシチュエーションタグを提案し、入力済みの値を優先して保存する。
- 登録日時を保持し、LibraryとAnki exportの期間フィルタへ利用する。
- Ankiの8フィールド、deck、tags、2音声を、個別選択・タグ絞り込み・登録日以降/期間指定でAPKG出力する。TSVは同じフィルタを使える補助出力とする。
- DEVではTTS key未設定時にbrowser-speechをfallbackとして画面再生できるが、これは`audio_ready`やAPKGのmedia要件を満たさない。
- TTS keyとprivate binary storageが利用できる環境では、選択variantのWAVを生成・保存し、`audio_ready`だけをAPKG export候補にする。DEVではprivate Blobの代わりにlocal binary storageを許可する。
- `/api/anki-exports`はAPKG生成とartifact ID返却、`/api/anki-exports/:id/download`はowner認証済みdownloadを担当する。TSVは`/api/anki-exports/tsv`の補助APIとする。
