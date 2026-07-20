# ADR-0012: DEVでの学習投影とAnki選択export

- Status: Accepted for DEV validation; superseded for export format by ADR 0010
- Date: 2026-07-20
- Scope: 登録表現を学習モードへ投影し、Anki取り込み用TSVを選択出力する

## Context

登録済みの`expression_entries`はLibraryだけで参照でき、既存の学習モードから選択できなかった。また、Anki exportの対象を個別・タグ・登録期間で選ぶ導線が必要になった。

## Decision

- `expression_entries`のうち`registered`かつselected variantを、既存`SceneCard` DTOへread projectionする。
- 既存の`practice_records`、`practice_attempts`、`saved_notes`のキーは変更しない。expression IDを`item_id`として使う。
- `registered_at`をexpression entryへ追加し、再登録時は最新登録日時へ更新する。
- Ankiの8フィールドは次の順序を正本としてAPKGへ出力する。
  `Index`, `Word`, `Definition`, `Irregular Forms`, `Example Sentence`, `Translation`, `word_audio`, `sentence_audio`
- APKGにはdeck、tags、固定GUID、Word/Example Sentenceの2 mediaを同梱する。タグは`source`、`genre`、`situation`、`difficulty`のnamespaceを使う。
- DEVの音声はTTS未設定時に`browser-speech` assetとしてDBへ記録し、LibraryではWeb Speech APIで再生する。これはAPKGのaudio_ready条件を満たさない。
- 初期`scene_cards`は音声binaryが別管理のため、同じfield projectionでTSV補助出力へ追加できる。正式APKGには追加しない。

## Consequences

- 既存学習UIを二重書き込みせず、新規表現を同じ練習履歴へ載せられる。
- DEVでは音声再生を確認できるが、TSVにもbrowser-speechにも音声binaryは同梱しない。
- provider-backed TTS、private storage、APKG adapterは本仕様の実装境界として追加する。残るrelease gateはTTS voiceの米国発音確認とAnki Desktop実import/reimportである。
