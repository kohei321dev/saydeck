-- AI-derived situation tags are required before an expression becomes registered.
-- Existing registered entries with no tags remain exportable under a safe fallback.

update expression_entries
set situation_tags = array['未分類']::text[]
where status = 'registered'
  and cardinality(situation_tags) = 0;

update expression_entries
set situation_tags = situation_tags[1:3]
where status = 'registered'
  and cardinality(situation_tags) > 3;

alter table expression_entries
  drop constraint if exists expression_entries_registered_situation_tags_check;

alter table expression_entries
  add constraint expression_entries_registered_situation_tags_check
  check (status <> 'registered' or cardinality(situation_tags) between 1 and 3)
  not valid;

alter table expression_entries
  validate constraint expression_entries_registered_situation_tags_check;
