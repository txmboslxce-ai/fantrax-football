create table public.season_player_pool (
  season text not null references public.seasons(id) on delete cascade,
  fantrax_id text not null,
  primary key (season, fantrax_id)
);

alter table public.season_player_pool enable row level security;

create policy season_player_pool_public_read
  on public.season_player_pool
  for select
  to anon, authenticated
  using (true);
