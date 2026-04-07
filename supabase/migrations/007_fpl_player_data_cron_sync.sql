alter table fpl_player_data
  add column if not exists season text not null default '2025-26',
  add column if not exists last_synced_at timestamptz not null default now();

create index if not exists idx_fpl_player_data_season on fpl_player_data(season);
