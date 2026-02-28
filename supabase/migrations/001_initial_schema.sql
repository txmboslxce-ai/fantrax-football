create extension if not exists pgcrypto;

create table teams (
  abbrev text primary key,
  name text not null,
  full_name text not null
);

create table fixtures (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  gameweek integer not null,
  home_team text references teams(abbrev),
  away_team text references teams(abbrev),
  unique(season, gameweek, home_team)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  fantrax_id text unique not null,
  name text not null,
  team text references teams(abbrev),
  position text not null check (position in ('D','M','F','G')),
  ownership_pct text,
  ownership_change text,
  is_keeper boolean default false,
  created_at timestamptz default now()
);

create table player_gameweeks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  season text not null,
  gameweek integer not null,
  games_played integer default 0,
  games_started integer default 0,
  minutes_played integer default 0,
  raw_fantrax_pts numeric(6,2) default 0,
  ghost_pts numeric(6,2) default 0,
  goals integer default 0,
  assists integer default 0,
  clean_sheet integer default 0,
  saves integer default 0,
  key_passes integer default 0,
  shots_on_target integer default 0,
  tackles_won integer default 0,
  interceptions integer default 0,
  clearances integer default 0,
  dribbles_succeeded integer default 0,
  blocked_shots integer default 0,
  aerials_won integer default 0,
  accurate_crosses integer default 0,
  penalties_drawn integer default 0,
  penalties_missed integer default 0,
  goals_against integer default 0,
  goals_against_outfield integer default 0,
  yellow_cards integer default 0,
  red_cards integer default 0,
  own_goals integer default 0,
  subbed_on integer default 0,
  subbed_off integer default 0,
  penalty_saves integer default 0,
  high_claims integer default 0,
  smothers integer default 0,
  uploaded_at timestamptz default now(),
  unique(player_id, season, gameweek)
);

alter table teams enable row level security;
alter table fixtures enable row level security;
alter table players enable row level security;
alter table player_gameweeks enable row level security;

create policy teams_public_read
  on teams
  for select
  to anon, authenticated
  using (true);

create policy fixtures_public_read
  on fixtures
  for select
  to anon, authenticated
  using (true);

create policy players_public_read
  on players
  for select
  to anon, authenticated
  using (true);

create policy player_gameweeks_public_read
  on player_gameweeks
  for select
  to anon, authenticated
  using (true);
