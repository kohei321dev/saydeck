-- Replace the four expression layers with the approved three-layer model.
-- Apply after 0010 with the matching application release.
-- Existing rows are preserved: basic becomes standard, one spoken/native row
-- becomes native, and incompatible legacy variants are archived.

begin;

alter table generation_profiles
  drop constraint if exists generation_profiles_code_check;

alter table generation_profiles
  add constraint generation_profiles_code_check
  check (
    code in (
      'standard', 'native', 'pattern',
      'basic', 'detail', 'conversation', 'natural_alternative'
    )
  );

alter table sentence_variants
  drop constraint if exists sentence_variants_profile_code_check,
  drop constraint if exists sentence_variants_pattern_code_check;

alter table sentence_variants
  add constraint sentence_variants_profile_code_check
  check (
    profile_code in (
      'standard', 'native', 'pattern',
      'basic', 'detail', 'conversation', 'natural_alternative'
    )
  ),
  add constraint sentence_variants_pattern_code_check
  check (
    (profile_code = 'pattern' and pattern_code in ('a', 'b', 'c'))
    or (profile_code = 'detail' and pattern_code in ('a', 'b', 'c', 'd', 'e'))
    or (
      profile_code not in ('pattern', 'detail')
      and pattern_code = 'default'
    )
  );

update sentence_variants
set profile_code = 'standard',
  pattern_code = 'default',
  updated_at = now()
where profile_code = 'basic';

with native_candidates as (
  select
    id,
    row_number() over (
      partition by owner_login, sentence_card_id
      order by
        case profile_code
          when 'natural_alternative' then 1
          else 2
        end,
        created_at asc,
        id asc
    ) as candidate_order
  from sentence_variants legacy
  where legacy.profile_code in ('conversation', 'natural_alternative')
    and not exists (
      select 1
      from sentence_variants existing
      where existing.owner_login = legacy.owner_login
        and existing.sentence_card_id = legacy.sentence_card_id
        and existing.profile_code = 'native'
    )
)
update sentence_variants variant
set profile_code = 'native',
  pattern_code = 'default',
  updated_at = now()
from native_candidates candidate
where variant.id = candidate.id
  and candidate.candidate_order = 1;

update sentence_variants
set is_selected = false,
  status = 'archived',
  updated_at = now()
where profile_code in ('detail', 'conversation', 'natural_alternative');

insert into generation_profiles (
  owner_login, code, name, min_words, max_words, max_sentences,
  required_features, instruction
)
select distinct
  owner_login,
  'standard',
  '01_標準表現',
  2,
  18,
  1,
  '["required", "standard_grammar", "single_speech_act", "necessary_detail"]'::jsonb,
  '必須。1文・原則18語以内で、1つの発話行為を標準的で自然な英語にする。入力の意図に必要な詳細は含めてよいが、独立した複数の内容は意味単位へ分ける。'
from generation_profiles
on conflict (owner_login, code) do update set
  name = excluded.name,
  min_words = excluded.min_words,
  max_words = excluded.max_words,
  max_sentences = excluded.max_sentences,
  required_features = excluded.required_features,
  instruction = excluded.instruction,
  updated_at = now();

insert into generation_profiles (
  owner_login, code, name, min_words, max_words, max_sentences,
  required_features, instruction
)
select distinct
  owner_login,
  'native',
  '02_ネイティブ・口語表現',
  2,
  22,
  1,
  '["optional", "native", "spoken", "conversational"]'::jsonb,
  '任意。01と同じ意図を、ネイティブ話者が会話で使う省略・定型句・自然な語順で表す。01と明確な差がある場合だけ1件生成する。'
from generation_profiles
on conflict (owner_login, code) do update set
  name = excluded.name,
  min_words = excluded.min_words,
  max_words = excluded.max_words,
  max_sentences = excluded.max_sentences,
  required_features = excluded.required_features,
  instruction = excluded.instruction,
  updated_at = now();

insert into generation_profiles (
  owner_login, code, name, min_words, max_words, max_sentences,
  required_features, instruction
)
select distinct
  owner_login,
  'pattern',
  '03_表現パターン',
  2,
  22,
  1,
  '["optional", "learning_pattern", "complete_utterance"]'::jsonb,
  '任意。01を土台に、文法展開・熟語や句動詞・コロケーションを使った完成英文を、適用可能なpatternだけ最大3件生成する。'
from generation_profiles
on conflict (owner_login, code) do update set
  name = excluded.name,
  min_words = excluded.min_words,
  max_words = excluded.max_words,
  max_sentences = excluded.max_sentences,
  required_features = excluded.required_features,
  instruction = excluded.instruction,
  updated_at = now();

commit;
