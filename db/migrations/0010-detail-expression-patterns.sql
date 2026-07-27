-- Add intentional grammar/phrase patterns under the optional detail layer.
-- Apply after 0009 with the matching application release.

begin;

alter table sentence_variants
  add column if not exists pattern_code text not null default 'default';

-- Existing detail rows were single variants before patterning was introduced.
-- Preserve them as the first detail pattern during the transition.
update sentence_variants
set pattern_code = case when profile_code = 'detail' then 'a' else 'default' end
where pattern_code = 'default';

alter table sentence_variants
  drop constraint if exists sentence_variants_owner_login_sentence_card_id_profile_code_key,
  drop constraint if exists sentence_variants_pattern_code_check;

alter table sentence_variants
  add constraint sentence_variants_pattern_code_check
  check (
    (profile_code = 'detail' and pattern_code in ('a', 'b', 'c', 'd', 'e'))
    or (profile_code <> 'detail' and pattern_code = 'default')
  );

create unique index if not exists sentence_variants_owner_card_profile_pattern_key
  on sentence_variants (owner_login, sentence_card_id, profile_code, pattern_code);

drop index if exists sentence_variants_owner_card_idx;
create index sentence_variants_owner_card_pattern_idx
  on sentence_variants (owner_login, sentence_card_id, profile_code, pattern_code);

update generation_profiles
set
  min_words = 3,
  max_words = 18,
  max_sentences = 1,
  required_features = '["optional", "meaningful_detail", "patterned_detail"]'::jsonb,
  name = '02_詳細表現',
  instruction = '任意。基本表現を土台に、適用できるパターンだけを生成する。a=形容詞・補語、b=副詞・程度、c=前置詞句、d=熟語・定型結合、e=文法展開。基本表現の単なる長文化や語句置換は避け、各パターンはpatternCode a〜eを付ける。',
  updated_at = now()
where code = 'detail';

update generation_profiles
set
  name = '04_ネイティブ表現',
  instruction = '任意。同じ意図をネイティブ話者が使う自然な定型句・省略・別構文で表せる場合だけ生成する。単なる同義語の置換や不自然なスラングは生成しない。',
  updated_at = now()
where code = 'natural_alternative';

commit;
