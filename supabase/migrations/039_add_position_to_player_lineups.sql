-- The RotoWire sync parses a per-match position for each lineup player
-- (translated from RotoWire's codes to the app's own, e.g. DC -> CB) but
-- had nowhere to store it, so the portal page fell back to the player's
-- default position from the players table instead of what RotoWire
-- actually listed them at for this match. Add a column to hold it.
alter table player_lineups add column if not exists position text;
