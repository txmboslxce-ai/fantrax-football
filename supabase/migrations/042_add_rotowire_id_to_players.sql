alter table players add column if not exists rotowire_id integer;

-- Same pattern as players_bsd_id_unique: one Fantrax player per RotoWire
-- player id, partial index so unmatched players (rotowire_id = null)
-- can coexist.
create unique index if not exists players_rotowire_id_unique
  on players (rotowire_id)
  where rotowire_id is not null;
