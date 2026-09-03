alter table players add column if not exists bsd_id integer;

-- Enforce one Fantrax player (players row) per BSD (sports.bzzoiro.com)
-- player id. Partial index so multiple unmatched players (bsd_id = null)
-- remain allowed, matching the same pattern as players_fpl_id_unique.
create unique index if not exists players_bsd_id_unique
  on players (bsd_id)
  where bsd_id is not null;
