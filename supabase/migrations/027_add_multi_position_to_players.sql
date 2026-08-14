alter table players add column if not exists multi_position text;

comment on column players.multi_position is
  'Raw Fantrax multi-position eligibility string (e.g. "M,F"), verbatim from
   CSV/sync. Null or single-letter when the player has one eligible position.
   Does not replace or reorder players.position, which remains the sole
   primary position used everywhere else.';
