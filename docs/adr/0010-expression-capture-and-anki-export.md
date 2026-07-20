# ADR 0010: Expression capture and Anki export pipeline

- Status: Accepted
- Date: 2026-07-20
- Supersedes: ADR 0009の作成導線と情報設計の一部

## Context

SayDeckの既存作成モードは、学習シーンを追加する補助機能だった。新しい主な利用目的は、スケートボード中や日常で思いついた日本語表現を即座に保存し、AIによる難易度別の英文候補、音声、Ankiカードへ変換することである。

現行`scene_cards`は、シーンとL1〜L4のJSONを扱うには十分だが、意味単位の分割、variant単位の確定状態、音声asset、Anki GUID、export artifactを表現できない。音声binaryをNeonへ置くことも適さない。

## Decision

1. 既存の学習・認証・Neon接続を残し、表現教材化を独立domainとして追加する。
2. テキスト、タグ、状態、IDはNeon/Postgresを正本にする。
3. 音声とAPKGはprivate Vercel Blobに保存し、DBにはmetadataだけを保存する。
4. 入力保存、AI生成、分割確認、TTS、exportを段階処理に分ける。
5. すべてのL1〜L4候補を保存し、ユーザーが選んだvariantだけを音声化・exportする。
6. `.apkg`は`SayDeck ES1Kv2` note typeで出力し、サンプルと同じ8 field・field順・2音声fieldを使う。
7. package出力はAnki adapterへ隔離し、初期実装では`ankipack@0.1.3`をexact pinする。
8. 既存`scene_cards`とpractice系migrationは削除しない。新旧を二重書き込みせず、必要時にread projectionする。

## Options Considered

### Option A: `scene_cards.levels`へ音声・export情報を追加する

- 利点: table追加が少ない。
- 却下理由: 分割・variant・audio・Anki IDの更新境界がJSONへ混在し、保守性が低い。

### Option B: audio binaryもNeonへ保存する

- 利点: 保存先が1つになる。
- 却下理由: binary配信、容量、package生成に不向きである。

### Option C: TSVだけをexportする

- 利点: 実装が軽い。
- 却下理由: 音声を1ファイルに同梱できず、サンプルの利用体験を満たさない。

### Option D: 新domain + private object storage + APKG

- 採用理由: card lifecycle、音声、再export、Anki互換性を明確な境界で扱える。

## Consequences

- `/create`、`/library`、generation profile設定、audio/export APIを追加する。
- 新規DB migration、private Blob、TTS API key、runtime diagnosticsが必要になる。
- 現行巨大UIと旧APIは、新UIが置換完了するまで残る。
- APKG libraryの成熟度リスクをadapterと実Anki import testで閉じ込める。

## Implementation status

- `src/lib/tts-provider.ts`がserver-side Speech APIを呼び、WordとExample SentenceをWAV化する。
- `src/lib/binary-store.ts`がProductionのprivate Vercel Blobとlocalhost限定のlocal fallbackを抽象化する。
- `src/lib/anki-apkg.ts`が`ankipack@0.1.3`で8 field、固定model/deck ID、固定GUID、2 mediaを組み立てる。
- `/api/anki-exports`はAPKG artifact IDを返し、`/api/anki-exports/:id/download`がowner認証済みでstreamする。TSVは`/api/anki-exports/tsv`へ分離した。
- Anki Desktopが実行環境にないため、空profileへの実import/reimportは未検証であり、リリースgateとして残る。

## Security / Privacy

- 書き込み、音声、exportはowner認証を必須にする。
- raw入力、AI本文、API key、Blob token、signed URLをログへ出さない。
- private BlobのURLを恒久的な共有URLとして扱わない。

## Operations

- TTS、Blob、APKG生成の成功・失敗・duration・provider error categoryを安全な構造化ログへ残す。
- quota/rate-limitはprovider共通のユーザー向けエラーに正規化する。
- Cloud integrationとsecret設定は実装時に承認を得てから実施する。

## Revisit Conditions

- Anki import compatibility gateに失敗する。
- owner以外への共有が必要になる。
- APKGサイズや生成時間がVercel Functionの制約を超える。
- direct Anki syncや日本語音声が必要になる。

## References

- `docs/requirements.md`
- `docs/design.md`
- `docs/specifications/anki-export.md`
- `docs/adr/0008-neon-postgres-practice-records.md`
- `docs/adr/0009-scene-builder-ux-architecture.md`
- `docs/adr/0011-rename-to-saydeck.md`
