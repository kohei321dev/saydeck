# ADR 0013: Expression production and APKG-only product scope

- Status: Accepted
- Date: 2026-07-20
- Supersedes: ADR 0009の現行UX、ADR 0010の学習統合・手動音声登録部分、ADR 0012全体

## Context

リアーキテクチャ後の画面に、旧仕様の学習モード、Owner deck、練習履歴が残り、新しい表現生成domainもLibraryや学習画面へ投影されている。さらに、語句音声やWAVを個別生成する操作とTSV exportが表示され、利用者の目的より内部実装が前面に出ている。

今回確認した本来の要求は、次の2責務である。

1. 日本語の言いたいこととシチュエーションから、ジャンル・シチュエーション・レベルに合う基本ワードと例文を生成し、Anki fieldへ最適化してDBへ保存する。
2. 保存した表現を柔軟に選択・分類し、米国英語音声付きAPKGとしてAnkiへ渡す。

復習はAnkiで行うため、SayDeck内の学習・添削機能は責務が重複する。

## Decision

1. SayDeckの主要UIを`INPUT`、`LISTS`、`EXPORT`の3画面に限定する。
2. アプリ内学習、AI添削、回答、採点、練習履歴、復習キューをproduct scopeから外す。
3. `Deck`は固定の学習キューではなく、ジャンル、シチュエーション、レベル、作成日時などによる論理的なグループとして扱う。
4. AIは固定Anki fieldに対応する構造化データを生成し、確認後にDBへ保存する。
5. 正式なexport形式を音声同梱APKGだけにする。TSV、CSV、個別WAV exportは廃止する。
6. APKG用音声は米国英語`en-US`を必須とし、日本語voiceやbrowser既定voiceへfallbackしない。
7. WordとExample Sentenceのmedia生成はAPKG作成の内部処理とし、個別の音声登録・WAV生成ボタンを表示しない。
8. 旧practice系tableとmigrationはデータ保全のため当面残すが、現行UIへ表示・投影せず、新domainへ二重書き込みしない。
9. 実装は、不要な旧機能の削除を最初に完了し、その後`INPUT`、`LISTS`、`EXPORT`の順で進める。

## Options Considered

### Option A: 学習画面を残し、新機能と統合する

- 利点: 既存実装と履歴を利用できる。
- 却下理由: Ankiと責務が重複し、主要導線とデータmodelが複雑になる。

### Option B: 学習画面を隠すだけでAPIと投影を残す

- 利点: UI変更が小さい。
- 却下理由: 不要な結合と保守コストが残り、再びUIへ露出する可能性がある。

### Option C: INPUT / LISTS / EXPORTへ限定し、APKGだけを出力する

- 採用理由: 利用者のjobと情報設計が一致し、各画面の主要操作が明確になる。Ankiとの責務分担も明確になる。

## Consequences

- 旧`ScenePractice`とpractice/review/notes系UI・APIを削除する実装Issueが必要になる。
- `/create`と`/library`を`/input`と`/lists`へ整理する。
- 音声生成を個別登録APIからAPKG export orchestrationへ移す。
- TSV UI・API・変換処理を削除する。
- TTS locale/voiceの明示と実音声の試聴をrelease gateに追加する。
- 旧practice dataは残るが、現行productからは到達不能になる。
- Cleanup完了前に新しい3画面の実装を進めないため、一時的に機能が減る期間を許容する。

## Security / Privacy

- INPUT、LISTS、EXPORTの読み書きとdownloadはowner認証を必須にする。
- raw入力、AI本文、API key、storage token、private URLをlogへ出さない。
- APKGと音声assetはprivate storageへ保存し、認証済みrouteからだけ配信する。

## Operations

- AI生成、TTS、storage、APKG生成を別の失敗分類として記録し、再試行可能にする。
- TTS metadataにlocaleを追加し、`en-US`でない既存assetを再利用しない。
- 旧tableのdropは本ADRに含めず、backupと移行判断を伴う別ADRで扱う。

## Revisit Conditions

- SayDeck内でAnkiとは異なる学習体験が必要だと利用実績から確認できた場合。
- 名前付きDeckや保存済みfilterが必要になった場合。
- Anki以外のexport先または直接同期が必要になった場合。
- 単一APKGでは扱えないmedia要件が生じた場合。

## References

- `docs/product-brief.md`
- `docs/requirements.md`
- `docs/design.md`
- `docs/specifications/anki-export.md`
- `docs/adr/0010-expression-capture-and-anki-export.md`
- `docs/adr/0012-dev-learning-projection-and-anki-selection.md`
