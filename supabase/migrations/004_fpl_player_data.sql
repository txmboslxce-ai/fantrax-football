alter table players add column if not exists fpl_id integer;

create table if not exists fpl_player_data (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) on delete cascade,
  fpl_id integer unique,
  status text,
  chance_of_playing_next_round integer,
  news text,
  news_added timestamptz,
  expected_goals_per_90 numeric(5,3),
  expected_assists_per_90 numeric(5,3),
  penalties_order integer,
  corners_order integer,
  direct_freekicks_order integer,
  starts_per_90 numeric(5,3),
  synced_at timestamptz default now(),
  unique(player_id)
);

create index if not exists idx_fpl_data_player on fpl_player_data(player_id);
create index if not exists idx_fpl_data_status on fpl_player_data(status);

alter table fpl_player_data enable row level security;

create policy fpl_data_public_read
  on fpl_player_data for select
  to anon, authenticated
  using (true);
