# ADR 0003: AI review provider and cost control

- Status: Proposed
- Date: 2026-05-24

## Context

Scene Speakでは、ユーザーが入力した英語回答に対して、点数、修正文、自然な言い換え、覚える表現を返したい。

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

「Glock」と言っているAPI keyが次のどちらかで、env名とendpointが変わる。

- GroqCloudの場合: `GROQ_API_KEY`
- xAI Grok APIの場合: `XAI_API_KEY`

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

