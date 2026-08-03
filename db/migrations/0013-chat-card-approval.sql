-- Slack / Discord capture requests that become SayDeck entries only after
-- the configured owner approves the generated candidates.

begin;

create table if not exists chat_card_requests (
  id text primary key,
  owner_login text not null,
  platform text not null check (platform in ('slack', 'discord')),
  platform_user_id text not null,
  platform_workspace_id text not null default '',
  platform_channel_id text not null default '',
  platform_thread_id text not null default '',
  source_event_id text not null,
  entry_id text not null,
  status text not null default 'generating'
    check (status in (
      'generating',
      'awaiting_approval',
      'approving',
      'approved',
      'rejected',
      'failed'
    )),
  primary_situation_id text,
  primary_situation_label_ja text not null default ''
    check (char_length(primary_situation_label_ja) <= 120),
  secondary_situation_label_ja text not null default ''
    check (char_length(secondary_situation_label_ja) <= 120),
  selected_variant_ids text[] not null default array[]::text[]
    check (cardinality(selected_variant_ids) <= 100),
  error_code text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, source_event_id),
  unique (owner_login, id),
  foreign key (owner_login, entry_id)
    references expression_entries (owner_login, id)
    on delete cascade
);

create index if not exists chat_card_requests_owner_status_idx
  on chat_card_requests (owner_login, status, updated_at desc);

create index if not exists chat_card_requests_actor_idx
  on chat_card_requests (platform, platform_user_id, updated_at desc);

commit;
