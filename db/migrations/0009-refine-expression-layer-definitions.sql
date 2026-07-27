-- Refine the semantic expression-layer definitions introduced by 0008.
-- Apply after 0008. This migration changes generation guidance only; it does not
-- rewrite any saved expressions.

begin;

update generation_profiles
set
  min_words = 2,
  max_words = 12,
  max_sentences = 1,
  required_features = '["required", "standard_grammar", "single_speech_act", "minimal_information"]'::jsonb,
  instruction = '必須。1文・原則12語以内で、1つの発話行為だけを標準的な語順で伝える最小の表現にする。条件節、仮定、理由、数量、間接的な依頼・丁寧な緩和表現は入れない。複数の内容がある入力は意味単位に分け、基本表現へ詰め込まない。',
  updated_at = now()
where code = 'basic';

update generation_profiles
set
  instruction = '任意。基本表現に、理由・条件・時刻や数量・追加の依頼など、状況を正確に伝える具体情報を加える場合だけ生成する。基本表現より長く複雑になってよい。',
  updated_at = now()
where code = 'detail';

update generation_profiles
set
  instruction = '任意。口語、省略、くだけた言い回しなど、会話として基本表現と明確に異なる自然な言い方がある場合だけ生成する。短くてもよく、基本表現より難しいことを要件にしない。',
  updated_at = now()
where code = 'conversation';

commit;
