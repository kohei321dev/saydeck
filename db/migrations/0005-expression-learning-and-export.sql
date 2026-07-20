-- SayDeck DEV slice: learning projection, registration timestamps, and
-- deterministic Anki selection metadata.

alter table expression_entries
  add column if not exists registered_at timestamptz;

alter table sentence_variants
  add column if not exists anki_index text;

update sentence_variants
set anki_index = coalesce(anki_index, anki_guid)
where anki_index is null;

alter table sentence_variants
  alter column anki_index set not null;

update expression_entries
set registered_at = coalesce(registered_at, updated_at)
where status = 'registered' and registered_at is null;

insert into audio_assets (
  id, owner_login, variant_id, kind, blob_path, text_hash,
  provider, model, voice, speed, format, status
)
select
  'audio_' || v.id || '_word', v.owner_login, v.id, 'word',
  'browser-speech://' || v.id || '/word', md5(v.key_expression),
  'browser-speech', 'SpeechSynthesis', 'en-US', 1.0, 'wav', 'ready'
from sentence_variants v
where v.is_selected = true
on conflict (owner_login, variant_id, kind) do nothing;

insert into audio_assets (
  id, owner_login, variant_id, kind, blob_path, text_hash,
  provider, model, voice, speed, format, status
)
select
  'audio_' || v.id || '_sentence', v.owner_login, v.id, 'sentence',
  'browser-speech://' || v.id || '/sentence', md5(v.english),
  'browser-speech', 'SpeechSynthesis', 'en-US', 1.0, 'wav', 'ready'
from sentence_variants v
where v.is_selected = true
on conflict (owner_login, variant_id, kind) do nothing;

create index if not exists expression_entries_owner_registered_idx
  on expression_entries (owner_login, registered_at desc, id desc);

create index if not exists sentence_variants_owner_selected_idx
  on sentence_variants (owner_login, is_selected, status, updated_at desc);
