# ADR 0015: Situation tag taxonomy and Anki deck hierarchy

- Status: Accepted
- Date: 2026-07-21
- Supersedes: ADR 0013のDecision 3にあるAnki deckの扱い

## Context

INPUTでシチュエーションを自由入力させると、実際に必要な「思いつきを即座に残す」導線に不要な判断が増える。自由なタグ入力は同義語と表記揺れを生み、Anki deckの分類軸にも使えない。

一方、Ankiではnoteを複数deckへ同時に置けない。同じ表現をタグごとに複製すると、新規カードと再import更新の区別が崩れ、重複学習につながる。

## Decision

1. INPUTの必須項目は`言いたいこと（日本語）`だけとする。シチュエーションとシチュエーションタグの入力欄は置かない。
2. ジャンルは任意とし、`日常生活`、`スケートボード`、`その他`、`指定なし`から選ぶ。`その他`だけ自由入力を許可する。
3. xAIは言いたいことを読んでシチュエーションタグを1〜3件返す。日常生活とスケートボードを中心にした候補プールをpromptへ渡し、該当候補を優先する。該当候補がなければ短い日本語タグを新規生成する。
4. タグの先頭を主シチュエーションタグとする。登録済みentryは少なくとも1件のタグを持つことをDB制約とアプリケーション検証の両方で保証する。
5. Anki deck名を`SayDeck::<難易度>::<主シチュエーションタグ>`とする。複数タグの残りはAnki tagsへ出力し、noteの複製は行わない。
6. variantごとに保存済みのGUIDとIndexを再export時も使い続ける。登録済みentryの再生成によるvariant置換は禁止し、新規入力・新規variantには新GUIDを発行する。

## Options considered

### Option A: シチュエーションをユーザーが毎回自由入力する

却下。入力負担と表記揺れが大きく、deck分類が安定しない。

### Option B: タグごとに同じnoteを複数deckへ複製する

却下。Anki内で重複カードになり、再import時の更新と新規追加を明確に扱えない。

### Option C: AI分類、主タグによる単一deck、残余タグによる絞り込み

採用。入力を最小化しつつ、deck階層を安定させ、複数の文脈はtagsで失わない。

## Consequences

- 新しいmigrationで登録済みentryに1件以上の`situation_tags`を要求し、既存の空タグentryは`未分類`へbackfillする。
- 旧`situation_ja`列は既存データとの互換性のため残すが、現行INPUTの正本ではない。
- タグプールの追加・統合はdeck名へ影響するため、既存タグの名称変更は別途移行判断として扱う。
- 登録済みentryの候補を作り直したい場合は、新しい入力として作成する。既存のAnki GUIDを破壊しない。

## References

- `docs/requirements.md`
- `docs/design.md`
- `docs/specifications/anki-export.md`
