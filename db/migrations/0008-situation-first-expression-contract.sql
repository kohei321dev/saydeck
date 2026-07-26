-- Situation-first SayDeck domain.
-- This is intentionally destructive for the SayDeck expression domain only.
-- Apply after 0001-0007 together with the application release that reads this schema.

begin;

truncate table expression_entries cascade;
truncate table anki_exports;
truncate table generation_profiles;

alter table generation_profiles
  drop constraint if exists generation_profiles_code_check;

alter table generation_profiles
  add constraint generation_profiles_code_check
  check (code in ('basic', 'detail', 'conversation', 'natural_alternative'));

alter table expression_entries
  drop column if exists genre_slug,
  drop column if exists situation_ja,
  drop column if exists situation_tags,
  add column if not exists situation_sequence integer;

alter table expression_entries
  add constraint expression_entries_situation_sequence_check
  check (situation_sequence is null or situation_sequence > 0);

alter table expression_entries
  add constraint expression_entries_registered_sequence_check
  check (status <> 'registered' or situation_sequence is not null);

create table situation_definitions (
  id text primary key,
  owner_login text not null,
  parent_id text,
  kind text not null check (kind in ('primary', 'secondary')),
  base_label_ja text not null check (char_length(base_label_ja) between 1 and 120),
  duplicate_sequence integer not null default 0 check (duplicate_sequence >= 0),
  label_ja text not null check (char_length(label_ja) between 1 and 140),
  canonical_key text not null check (char_length(canonical_key) between 1 and 160),
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_login, id),
  foreign key (owner_login, parent_id)
    references situation_definitions (owner_login, id)
    on delete restrict,
  check (
    (kind = 'primary' and parent_id is null)
    or (kind = 'secondary' and parent_id is not null)
  )
);

create unique index situation_definitions_primary_key_idx
  on situation_definitions (owner_login, canonical_key)
  where kind = 'primary';

create unique index situation_definitions_secondary_label_idx
  on situation_definitions (owner_login, parent_id, label_ja)
  where kind = 'secondary';

create index situation_definitions_owner_parent_idx
  on situation_definitions (owner_login, parent_id, status, sort_order, updated_at desc);

create table expression_entry_situations (
  entry_id text not null references expression_entries (id) on delete cascade,
  situation_id text not null references situation_definitions (id) on delete restrict,
  role text not null check (role in ('primary', 'secondary')),
  selected_by text not null check (selected_by in ('ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entry_id, role),
  unique (entry_id, situation_id)
);

create index expression_entry_situations_by_situation_idx
  on expression_entry_situations (situation_id, entry_id);

create table situation_sequence_counters (
  owner_login text not null,
  primary_situation_id text not null,
  last_sequence integer not null default 0 check (last_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_login, primary_situation_id),
  foreign key (owner_login, primary_situation_id)
    references situation_definitions (owner_login, id)
    on delete restrict
);

alter table sentence_variants
  drop constraint if exists sentence_variants_profile_code_check;

alter table sentence_variants
  rename column english to expression_en;

alter table sentence_variants
  rename column japanese to translation_ja;

alter table sentence_variants
  drop column if exists key_expression,
  drop column if exists definition_ja,
  drop column if exists irregular_forms,
  drop column if exists constraints,
  drop column if exists review_points;

alter table sentence_variants
  add constraint sentence_variants_profile_code_check
  check (profile_code in ('basic', 'detail', 'conversation', 'natural_alternative'));

create unique index sentence_variants_owner_anki_index_idx
  on sentence_variants (owner_login, anki_index);

drop table audio_assets;

create table audio_assets (
  id text primary key,
  owner_login text not null,
  variant_id text not null,
  blob_path text not null default '',
  text_hash text not null,
  provider text not null default '',
  model text not null default '',
  voice text not null default '',
  locale text not null default 'en-US',
  speed numeric(4, 2) not null default 1.0 check (speed > 0 and speed <= 4),
  format text not null default 'wav',
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'stale')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_login, id),
  unique (owner_login, variant_id),
  foreign key (owner_login, variant_id)
    references sentence_variants (owner_login, id)
    on delete cascade
);

create index audio_assets_owner_status_idx
  on audio_assets (owner_login, status, updated_at desc);

commit;
