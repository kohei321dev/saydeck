create table if not exists practice_attempts (
  id text primary key,
  owner_login text not null,
  mode text not null check (mode in ('topic', 'diary')),
  item_id text not null,
  level text not null,
  answer text not null default '',
  review jsonb,
  score integer check (score between 0 and 10),
  practiced_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists practice_attempts_owner_item_idx
  on practice_attempts (owner_login, mode, item_id, level, practiced_at desc);

create table if not exists saved_notes (
  id text primary key,
  owner_login text not null,
  mode text not null check (mode in ('topic', 'diary')),
  item_id text not null,
  level text not null,
  scene_ja text not null default '',
  answer text not null default '',
  review jsonb,
  score integer check (score between 0 and 10),
  tags text[] not null default array[]::text[],
  source_attempt_id text references practice_attempts(id) on delete set null,
  saved_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_notes_owner_saved_at_idx
  on saved_notes (owner_login, saved_at desc);

create index if not exists saved_notes_owner_item_idx
  on saved_notes (owner_login, mode, item_id, level, saved_at desc);
