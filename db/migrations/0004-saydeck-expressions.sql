-- SayDeck expression capture domain.
-- Apply after 0001-0003. Existing scene_cards/practice tables are intentionally kept.

create table if not exists generation_profiles (
  owner_login text not null,
  code text not null check (code in ('L1', 'L2', 'L3', 'L4')),
  name text not null,
  min_words integer not null check (min_words between 1 and 200),
  max_words integer not null check (max_words between min_words and 200),
  max_sentences integer not null check (max_sentences between 1 and 10),
  required_features jsonb not null default '[]'::jsonb
    check (jsonb_typeof(required_features) = 'array'),
  instruction text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_login, code)
);

create index if not exists generation_profiles_owner_idx
  on generation_profiles (owner_login, code);

create table if not exists expression_entries (
  id text primary key,
  owner_login text not null,
  input_ja text not null check (char_length(input_ja) between 1 and 2000),
  situation_ja text not null default '' check (char_length(situation_ja) <= 1000),
  genre_slug text not null default '' check (char_length(genre_slug) <= 120),
  situation_tags text[] not null default array[]::text[]
    check (cardinality(situation_tags) <= 20),
  status text not null default 'draft'
    check (status in ('draft', 'generating', 'generated', 'registered', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_login, id)
);

create index if not exists expression_entries_owner_updated_idx
  on expression_entries (owner_login, updated_at desc, id desc);

create index if not exists expression_entries_owner_status_idx
  on expression_entries (owner_login, status, updated_at desc);

create table if not exists sentence_cards (
  id text primary key,
  owner_login text not null,
  entry_id text not null,
  position integer not null check (position >= 0),
  intent_ja text not null check (char_length(intent_ja) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_login, id),
  unique (owner_login, entry_id, position),
  foreign key (owner_login, entry_id)
    references expression_entries (owner_login, id)
    on delete cascade
);

create index if not exists sentence_cards_owner_entry_position_idx
  on sentence_cards (owner_login, entry_id, position, id);

create table if not exists sentence_variants (
  id text primary key,
  owner_login text not null,
  sentence_card_id text not null,
  profile_code text not null check (profile_code in ('L1', 'L2', 'L3', 'L4')),
  english text not null check (char_length(english) between 1 and 2000),
  japanese text not null default '' check (char_length(japanese) <= 2000),
  key_expression text not null default '' check (char_length(key_expression) <= 500),
  definition_ja text not null default '' check (char_length(definition_ja) <= 1000),
  irregular_forms text not null default '' check (char_length(irregular_forms) <= 500),
  constraints text not null default '' check (char_length(constraints) <= 1000),
  review_points text not null default '' check (char_length(review_points) <= 1000),
  anki_guid text not null,
  is_selected boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'audio_ready', 'audio_failed', 'stale', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_login, id),
  unique (owner_login, sentence_card_id, profile_code),
  unique (anki_guid),
  foreign key (owner_login, sentence_card_id)
    references sentence_cards (owner_login, id)
    on delete cascade
);

create index if not exists sentence_variants_owner_status_idx
  on sentence_variants (owner_login, status, updated_at desc);

create index if not exists sentence_variants_owner_card_idx
  on sentence_variants (owner_login, sentence_card_id, profile_code);

create table if not exists audio_assets (
  id text primary key,
  owner_login text not null,
  variant_id text not null,
  kind text not null check (kind in ('word', 'sentence')),
  blob_path text not null default '',
  text_hash text not null,
  provider text not null default '',
  model text not null default '',
  voice text not null default '',
  speed numeric(4, 2) not null default 1.0 check (speed > 0 and speed <= 4),
  format text not null default 'wav',
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'stale')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_login, id),
  unique (owner_login, variant_id, kind),
  foreign key (owner_login, variant_id)
    references sentence_variants (owner_login, id)
    on delete cascade
);

create index if not exists audio_assets_owner_status_idx
  on audio_assets (owner_login, status, updated_at desc);

create table if not exists anki_exports (
  id text primary key,
  owner_login text not null,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  card_count integer not null default 0 check (card_count >= 0),
  blob_path text not null default '',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anki_exports_owner_created_idx
  on anki_exports (owner_login, created_at desc, id desc);
