-- APKG-only product scope. Legacy practice tables remain for data recovery.

alter table audio_assets
  add column if not exists locale text not null default 'en-US';

-- Browser speech assets cannot be included in an APKG. They are derived data,
-- so discard them and let EXPORT generate en-US provider-backed media.
delete from audio_assets
where provider = 'browser-speech';

update sentence_variants
set status = 'approved', updated_at = now()
where status in ('audio_ready', 'audio_failed', 'stale');
