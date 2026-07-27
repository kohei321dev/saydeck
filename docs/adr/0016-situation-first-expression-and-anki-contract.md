# ADR 0016: Situation-first expression and Anki contract

- Status: Accepted
- Date: 2026-07-27
- Supersedes: Anki field・分類・表現レイヤーに関するADR 0010、0012、0015の判断

## Context

旧SayDeck expression domainは、ジャンル、1〜3件のフラットなシチュエーションタグ、L1〜L4、基本ワードと例文、Word/Example Sentenceの2音声を前提にしていた。

現在のproduct責務は「日本語の言いたいことを、場面で使える英語表現へ変換し、Ankiで復習できるようにすること」である。旧契約は同じ意図の類似文を水増ししやすく、LISTSとAnkiで場面が分かりにくく、カード本文と音声も重複していた。

## Decision

1. ジャンルをUI、AI、API、DB、LISTS、Ankiから廃止する。
2. owner別の主・副シチュエーションmasterを作り、entryに各1件を割り当てる。
3. AIへ登録済み主一覧を渡し、既存IDまたは新規主名を提案させる。分類作成は人間の保存確定時だけ行う。
4. 副の完全重複には選択主の配下で`-001`以降を付け、新規分類として保存する。
5. 主分類ごとに入力連番を採番し、意味単位位置と合わせて`001-01`形式で表示する。
6. L1〜L4を`basic/detail/conversation/natural_alternative`へ置き換える。basicだけ必須で、他は差がある場合だけ生成する。basicは難易度の最下層ではなく、1文・原則12語以内・発話行為1つの最小・標準表現とする。条件・理由・数量・追加依頼・間接依頼はdetailまたは別の意味単位へ置く。conversationは口語性を表し、basicより短い場合を許容する。
7. variant本文をExpressionとTranslationへ単純化し、基本ワードと例文を分離しない。
8. variantごとにExpressionを読むen-US音声を1件だけ持つ。
9. Anki note typeを`SayDeck`、fieldを`Index/Context/Expression/Translation/expression_audio`の5件にする。
10. Deckを`SayDeck::主::副::表現レイヤー`とし、ContextをFront/Backへ表示する。音声はFrontだけに置く。
11. 既存SayDeck expressionデータを保持せず、破壊的migrationで旧契約を物理削除する。

## Options considered

### フラットなシチュエーションタグを維持

却下。主場面と今回の目的が区別できず、deck階層と復習対象を予測しにくい。

### 副シチュエーションをtagだけにする

却下。Ankiのdeckトグルから「何を復習するか」を認識しやすくするため、主と副の両方をdeckへ含める。

### L1〜L4を常に4件生成

却下。難易度差がない入力でも類似文が増える。semantic layerとし、basic以外は任意にする。

### 旧8フィールドnoteを維持

却下。WordとExample Sentenceが実際の発話カードとして重複し、2音声もproduct責務に不要。

## Consequences

- DB、AI schema、UI DTO、TTS cache、APKG templateを同一releaseで切り替える必要がある。
- 既存SayDeck expression、audio metadata、APKG履歴は削除される。
- Ankiで主・副・表現レイヤーをdeckとカード表示の両方から確認できる。
- 同じ副基底名を繰り返すと別deckが増える。これは依頼者が選択した仕様であり、意味的mergeは行わない。
- 初回export後に分類を変えて既存Ankiカードを自動移動する機能はMVP対象外。

## Security / Privacy

- 分類とentryはowner scopeでquery・mutationする。
- AIへ渡す主分類一覧にはID、表示名、canonical keyだけを含める。
- API key、DB URL、storage token、raw AI responseをclientやlogへ出さない。
- APKGと音声はprivate storageへ保存し、認証済みdownload routeだけから取得する。

## Operations

- `0008-situation-first-expression-contract.sql`を新アプリと同じreleaseで適用する。
- 適用前に旧SayDeck expressionデータが削除対象であることを確認する。
- schema probeは新分類table、counter、`expression_en`、`situation_sequence`を確認する。
- release前にxAI TTS実音声とAnki Desktop import/reimportを人間が確認する。

## Revisit conditions

- 複数userで分類masterを共有する。
- 副分類の意味的merge・rename・archiveを管理画面で行う。
- Anki deck移動を自動同期する。
- 1 variantから複数card templateを生成する。

## References

- `docs/uiux/proposed-situation-first-data-flow.html`
- `docs/requirements.md`
- `docs/design.md`
- `docs/specifications/anki-export.md`
- `db/migrations/0008-situation-first-expression-contract.sql`
