-- Precomputed player statistics summaries.
--
-- These tables hold the results of the same calculations that
-- lib/portal/playerMetrics.ts already performs (season totals, ghost-point
-- breakdowns, per-start averages, consistency stats, league-wide radar
-- rankings, and fixture-difficulty rankings). Previously those calculations
-- ran fresh, across the whole player pool, on every single page view of
-- Players / Stats / Draft Tool / Player Detail. They are now computed once
-- by lib/portal/summaryRecompute.ts, triggered right after new scores are
-- synced from Fantrax, and simply looked up by the pages from here.
--
-- Nothing here changes any scoring formula — it only changes when the
-- formula runs (once per sync, instead of once per page view).

create table public.player_window_stats (
  player_id uuid not null references public.players(id) on delete cascade,
  season text not null references public.seasons(id) on delete cascade,
  -- Named stat_window, not window: WINDOW is a reserved SQL keyword
  -- (used for window functions) and breaks as a bare column name.
  stat_window text not null check (stat_window in ('season', 'last5', 'last10')),

  -- Scope of the window (how many gameweeks/games/starts it covers)
  gameweeks_played integer not null default 0,
  games_played integer not null default 0,
  games_started integer not null default 0,
  total_minutes integer not null default 0,
  current_gameweek integer not null default 0,

  -- Points totals and averages
  season_pts numeric(8, 2) not null default 0,
  avg_pts_per_gameweek numeric(8, 2) not null default 0,
  avg_pts_per_game numeric(8, 2) not null default 0,
  avg_pts_per_start numeric(8, 2) not null default 0,
  total_ghost_pts numeric(8, 2) not null default 0,
  avg_ghost_per_gameweek numeric(8, 2) not null default 0,
  avg_ghost_per_game numeric(8, 2) not null default 0,
  avg_ghost_per_start numeric(8, 2) not null default 0,
  attack_pts numeric(8, 2) not null default 0,

  -- The Player Detail page's summary tiles are driven by a second,
  -- independently-written calculation (summarizePlayerSeason) that uses
  -- slightly different row filters than the table/window calculation
  -- (summarizePlayerWindow) above. The two rarely disagree, but to avoid
  -- changing any page's displayed number as part of this refactor, both
  -- results are stored rather than merged into one.
  season_avg_pts_per_start numeric(8, 2) not null default 0,
  season_avg_ghost_per_start numeric(8, 2) not null default 0,
  games_started_total integer not null default 0,

  -- Consistency stats (spread of points across starts)
  minutes_per_start numeric(8, 2) not null default 0,
  floor_per_start numeric(8, 2) not null default 0,
  ceiling_per_start numeric(8, 2) not null default 0,
  tenth_percentile_per_start numeric(8, 2) not null default 0,
  ninetieth_percentile_per_start numeric(8, 2) not null default 0,
  std_deviation numeric(8, 2) not null default 0,
  median_pts_per_start numeric(8, 2) not null default 0,
  coefficient_of_variation numeric(8, 2) not null default 0,

  -- Home / away splits
  home_avg numeric(8, 2) not null default 0,
  away_avg numeric(8, 2) not null default 0,
  home_pct numeric(8, 2) not null default 0,
  away_pct numeric(8, 2) not null default 0,
  home_pts_per_start numeric(8, 2) not null default 0,
  home_pts_pct numeric(8, 2) not null default 0,
  away_pts_per_start numeric(8, 2) not null default 0,
  away_pts_pct numeric(8, 2) not null default 0,

  -- Points-source breakdown (% of points from goals/assists/clean sheets/ghost)
  ghost_pts_pct numeric(8, 2) not null default 0,
  goals_pts_pct numeric(8, 2) not null default 0,
  assist_pts_pct numeric(8, 2) not null default 0,
  clean_sheet_pts_pct numeric(8, 2) not null default 0,
  attacking_pts_pct numeric(8, 2) not null default 0,
  defensive_pts_pct numeric(8, 2) not null default 0,
  total_attacking_defensive_pct numeric(8, 2) not null default 0,

  -- Raw counting stats (box-score totals for the window)
  goals integer not null default 0,
  assists integer not null default 0,
  clean_sheets integer not null default 0,
  key_passes integer not null default 0,
  shots_on_target integer not null default 0,
  dribbles_succeeded integer not null default 0,
  dispossessed integer not null default 0,
  tackles_won integer not null default 0,
  interceptions integer not null default 0,
  clearances integer not null default 0,
  blocked_shots integer not null default 0,
  aerials_won integer not null default 0,
  accurate_crosses integer not null default 0,
  goals_against_outfield integer not null default 0,
  saves integer not null default 0,
  penalty_saves integer not null default 0,
  goals_against integer not null default 0,
  high_claims integer not null default 0,
  smothers integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  own_goals integer not null default 0,
  penalties_missed integer not null default 0,
  penalties_drawn integer not null default 0,
  corner_kicks integer not null default 0,
  free_kick_shots integer not null default 0,

  computed_at timestamptz not null default now(),

  primary key (player_id, season, stat_window)
);

create index player_window_stats_season_window_idx
  on public.player_window_stats (season, stat_window);

-- Per-player radar chart datasets (rank + scaled value for every stat
-- shown on the Fantasy / Attacking / Defensive / Goalkeeper profile
-- charts), ranked against the full season-pool of players. Radar charts
-- are always season-scoped (never last5/last10), matching current
-- behaviour on the Player Detail page.
create table public.player_radar_profiles (
  player_id uuid not null references public.players(id) on delete cascade,
  season text not null references public.seasons(id) on delete cascade,
  profile text not null check (profile in ('fantasy', 'attacking', 'defensive', 'goalkeeper')),
  data jsonb not null,
  computed_at timestamptz not null default now(),

  primary key (player_id, season, profile)
);

create index player_radar_profiles_season_idx
  on public.player_radar_profiles (season);

-- Fixture difficulty ranking per real-world team, season, and position
-- (1 = hardest opponent, 20 = easiest), based on how many points that
-- team has conceded to players in that position. This does not vary by
-- individual player, only by position, so it is stored once per
-- (season, position) rather than once per player.
create table public.team_fixture_difficulty (
  team text not null references public.teams(abbrev) on delete cascade,
  season text not null references public.seasons(id) on delete cascade,
  position text not null check (position in ('D', 'M', 'F', 'G')),
  rank integer not null,
  avg_pts_conceded numeric(8, 2) not null default 0,
  computed_at timestamptz not null default now(),

  primary key (team, season, position)
);

create index team_fixture_difficulty_season_position_idx
  on public.team_fixture_difficulty (season, position);

alter table public.player_window_stats enable row level security;
alter table public.player_radar_profiles enable row level security;
alter table public.team_fixture_difficulty enable row level security;

create policy player_window_stats_public_read
  on public.player_window_stats
  for select
  to anon, authenticated
  using (true);

create policy player_radar_profiles_public_read
  on public.player_radar_profiles
  for select
  to anon, authenticated
  using (true);

create policy team_fixture_difficulty_public_read
  on public.team_fixture_difficulty
  for select
  to anon, authenticated
  using (true);
