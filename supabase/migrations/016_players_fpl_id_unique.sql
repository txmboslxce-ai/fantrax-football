-- Enforce one Fantrax player (players row) per FPL id. Partial index so
-- multiple unmatched players (fpl_id = null) remain allowed, matching the
-- same pattern as the `one_current_season` partial index on seasons.
create unique index if not exists players_fpl_id_unique
  on players (fpl_id)
  where fpl_id is not null;
