-- Owner-selectable AI provider and immutable generation provenance.

begin;

create table if not exists owner_ai_settings (
  owner_login text primary key,
  active_provider text not null default 'xai'
    check (active_provider in ('xai', 'sakana')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sentence_cards
  add column if not exists generation_provider text,
  add column if not exists generation_model text;

-- All cards before this migration were generated through the xAI-only path.
update sentence_cards
set generation_provider = coalesce(generation_provider, 'xai'),
  generation_model = coalesce(generation_model, 'grok-4.3')
where generation_provider is null
   or generation_model is null;

alter table sentence_cards
  alter column generation_provider set not null,
  alter column generation_model set not null;

alter table sentence_cards
  drop constraint if exists sentence_cards_generation_provider_check,
  drop constraint if exists sentence_cards_generation_model_check;

alter table sentence_cards
  add constraint sentence_cards_generation_provider_check
    check (generation_provider in ('xai', 'sakana')),
  add constraint sentence_cards_generation_model_check
    check (char_length(generation_model) between 1 and 200);

commit;
