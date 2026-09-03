-- The predicted-lineups pitch was deriving a display name by trimming our
-- own Fantrax players.name down to a last name -- which mangles players
-- RotoWire (correctly) shows as a single commonly-known name, e.g. "Rayan"
-- rendering as "Rocha" (his Fantrax surname) instead. Store RotoWire's own
-- parsed name text per row so the UI can show what RotoWire actually
-- displayed, which already gets this right.
alter table player_lineups add column if not exists rotowire_display_name text;
