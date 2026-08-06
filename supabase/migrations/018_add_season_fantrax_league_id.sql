alter table public.seasons
  add column if not exists fantrax_league_id text;
