-- Portal pages filter player_gameweeks by season and, where applicable, player_id.
-- The existing unique index begins with player_id and cannot support season-only reads.
create index if not exists player_gameweeks_season_player_id_idx
  on public.player_gameweeks (season, player_id);
