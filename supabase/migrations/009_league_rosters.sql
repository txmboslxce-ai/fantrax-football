create table if not exists league_rosters (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  league_id text not null,
  team_id text not null,
  team_name text not null,
  player_id uuid not null references players(id) on delete cascade,
  fantrax_player_id text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, fantrax_player_id)
);

create index if not exists league_rosters_profile_id_idx on league_rosters (profile_id);

alter table league_rosters enable row level security;

drop policy if exists league_rosters_own on league_rosters;

create policy league_rosters_own
  on league_rosters
  for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
