create table if not exists practice_records (
  owner_login text not null,
  mode text not null check (mode in ('topic', 'diary')),
  item_id text not null,
  level text not null,
  answer text not null default '',
  checks jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'learned', 'review')),
  review jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_login, mode, item_id, level)
);

create index if not exists practice_records_owner_status_idx
  on practice_records (owner_login, status, updated_at desc);
