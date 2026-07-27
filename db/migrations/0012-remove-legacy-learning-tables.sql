-- Remove the retired in-app learning schema and obsolete generation profiles.
-- Apply after 0011 with an application release that only exposes INPUT/LISTS/EXPORT.

begin;

-- saved_notes references practice_attempts, so remove it first.
drop table if exists saved_notes;
drop table if exists practice_attempts;
drop table if exists practice_records;
drop table if exists scene_cards;

delete from generation_profiles
where code in ('basic', 'detail', 'conversation', 'natural_alternative');

commit;
