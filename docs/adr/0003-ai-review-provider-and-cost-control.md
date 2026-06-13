# ADR 0003: AI review provider and cost control

- Status: Proposed
- Date: 2026-05-24

## Context

Scene Builderでは、ユーザーが入力した英語回答に対して、点数、修正文、自然な言い換え、覚える表現を返したい。

静的サイトだけでは自由入力の意味理解や自然な添削はできない。AI API連携が必要になる。一方で、API keyをclientへ置くと漏洩と課金事故のリスクが高い。

また、ChatGPT、Claude、Grokなどのチャットアプリのサブスクリプションと、外部アプリから使うAPI課金は別扱いになる前提で設計する。

## Decision

AI ReviewはNext.js Route Handlerでserver-side実行する。

- clientから直接AI providerを呼ばない
- API keyはVercel Environment Variablesに置く
- 初期は認証済みユーザーだけが `/api/review` を呼べる
- AI responseは構造化JSONで返す
- providerはadapterで隠蔽し、後でGroqCloud、xAI Grok、OpenAI、Anthropicへ差し替えられるようにする
- 初期providerは、手元で利用可能なAPI keyがあるproviderを採用する

## Provider Notes

「Grok」と言っているAPI keyはxAI Grok APIとして扱う。

- xAI Grok APIの場合: `GROK_API_KEY` または `XAI_API_KEY`
- GroqCloudの場合: `GROQ_API_KEY`
- 初期modelは `GROK_MODEL=grok-4.3`
- 英文添削は深い推論が不要なため、初期は `GROK_REASONING_EFFORT=none` とする
- 同じxAI API key内でより安い/適したmodelが使える場合は、`GROK_MODEL` の環境変数だけで差し替える
- 将来Claude Haikuなど別providerに切り替える場合は、provider adapterとenv keyを追加する

2026-05-26時点のxAI公式docsでは、一般テキスト用途はGrok 4.3推奨で、
旧fast系aliasもGrok 4.3側へ寄っている。短文添削MVPではmodel差し替え余地を残しつつ、
まずはreasoning無効化と短い出力でコストを抑える。

どちらでも、app側の設計は同じにする。

```text
Browser
  -> /api/review
  -> auth check
  -> rate limit
  -> provider adapter
  -> AI provider API
```

## Review Response Shape

```json
{
  "score": 8,
  "goodPoint": "You used a clear verb and the meaning is understandable.",
  "fix": "I have skated for about fifteen years.",
  "naturalAnswer": "I've been skating for about fifteen years.",
  "phraseToRemember": "I've been ... for ...",
  "nextPractice": "Ask the other person how long they have been skating."
}
```

## Cost Controls

- AI reviewはログイン必須にする
- 初期は自分のGitHub accountだけ許可する
- 1回のrequestで送るcontextを短くする
- model answer、topic、user answer、target levelだけ送る
- request body sizeを制限する
- provider側のspend limitを設定する
- server側で1日あたりのrequest数制限を入れる
- error時は模範回答とセルフチェックへfallbackする

## Consequences

### Positive

- API keyをclientに出さない
- provider差し替えがしやすい
- 最初は自分だけが安全に使える
- 後でユーザーログ保存やSSO拡張に移りやすい

### Negative

- 静的hostingだけでは完結しない
- Vercel Function実行とAI API利用の両方に運用コストが発生する
- 認証、rate limit、ログ保存の設計が必要になる

## Sources Checked

- OpenAI API billing and ChatGPT subscription are separate products: https://openai.com/api/pricing/
- Anthropic Claude subscription and API Console billing are separate: https://support.anthropic.com/en/articles/9876003-i-subscribe-to-a-paid-claude-ai-plan-why-do-i-have-to-pay-separately-for-api-usage-on-console
- xAI API billing uses prepaid credits or monthly invoiced billing: https://docs.x.ai/docs/key-information
- xAI account FAQ says Grok and xAI API billing are separate: https://docs.x.ai/developers/faq/accounts
- GroqCloud uses `GROQ_API_KEY` and supports AI SDK integration: https://console.groq.com/docs/quickstart
- GroqCloud spend limits can cap organization-wide API usage: https://console.groq.com/docs/spend-limits

## Addendum: owner/viewer AI provider split

- Date: 2026-06-13
- Status: Accepted implementation update

[事実] 実装は、owner と viewer でAI providerとAPI keyを分離した。

- owner AI: `OWNER_AI_KEY` + `OWNER_AI_MODEL`
- viewer AI: `VIEWER_AI_KEY` + `VIEWER_AI_MODEL`
- owner model allowlist: `grok-4.3`
- viewer model allowlist: `claude-haiku-4-5-20251001`
- owner Grok reasoning effortはenvに出さず、code上で `none` 固定にする
- viewer Claude max tokensはenvに出さず、code上で `700` 固定にする

[判断] modelやreasoning設定を広くenv化せず、allowlistと固定値でfail closedする。理由は、env誤設定で意図しないmodelへ流す事故を避けるため。

[判断] viewer AI reviewはowner用Grok keyを使わない。viewer用Claude keyを別に持ち、漏洩・利用量・停止範囲をownerから分離する。
