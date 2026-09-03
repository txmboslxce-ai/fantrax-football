-- Persisted per-match BSD data for building stats-based (not just historic
-- score) player projections: team-level match stats (already aggregated by
-- BSD -- big chances, shots inside/outside box, etc.) and player-level shot
-- data (shots, xG, xG-on-target) aggregated from the shot-by-shot feed.
-- BSD's own fetch-cache is short-lived and only meant for live display, so
-- this is a durable copy, backfilled once per fixture and never refetched.
--
-- Keyed on the BSD-side ids (bsd_event_id / bsd_player_id) rather than a
-- players.id foreign key -- a player who isn't bsd-mapped yet at backfill
-- time still gets a row, and a mapping added later doesn't require
-- re-backfilling; joins to `players` happen at query time via players.bsd_id.

create table if not exists team_match_stats (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures(id) on delete cascade,
  bsd_event_id integer not null,
  team_abbrev text not null,
  is_home boolean not null,
  expected_goals numeric(5, 2),
  total_shots integer,
  shots_on_target integer,
  shots_inside_box integer,
  shots_outside_box integer,
  big_chances integer,
  big_chances_scored integer,
  big_chances_missed integer,
  touches_in_penalty_area integer,
  tackles_won integer,
  interceptions integer,
  clearances integer,
  corner_kicks integer,
  dispossessed integer,
  blocked_shots integer,
  yellow_cards integer,
  red_cards integer,
  ball_possession integer,
  pass_accuracy_pct numeric(5, 2),
  dangerous_attack_pct numeric(5, 2),
  -- Full stats.home/away object verbatim (crosses, dribbles, aerial_duels,
  -- long_balls, ground_duels, final_third_phase, etc.) so nothing BSD
  -- provides is lost even before the model's exact feature set is settled.
  raw jsonb not null,
  updated_at timestamptz not null default now(),
  unique (fixture_id, is_home)
);

create table if not exists player_match_shot_stats (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures(id) on delete cascade,
  bsd_event_id integer not null,
  bsd_player_id integer not null,
  team_abbrev text not null,
  is_home boolean not null,
  shots integer not null default 0,
  shots_on_target integer not null default 0,
  shots_inside_box integer not null default 0,
  shots_outside_box integer not null default 0,
  headers integer not null default 0,
  goals integer not null default 0,
  -- Real assists, from goal incidents' passer id -- not expected assists:
  -- BSD's shot data doesn't tag a passer on shots that didn't score, so a
  -- creator only shows up here when their chance actually went in. See
  -- lib/bsd/matchStatsBackfill.ts for why xA isn't buildable from this feed.
  assists integer not null default 0,
  xg numeric(6, 3) not null default 0,
  xgot numeric(6, 3) not null default 0,
  -- Every shot this player took that match, verbatim, for re-analysis
  -- without re-fetching BSD (shot placement, situation, per-shot xG/xGOT).
  raw jsonb not null,
  updated_at timestamptz not null default now(),
  unique (fixture_id, bsd_player_id)
);

create index if not exists player_match_shot_stats_bsd_player_id_idx on player_match_shot_stats (bsd_player_id);

-- Writes go through the backfill job using the service-role client
-- (bypasses RLS), matching the rest of the app's admin-only-write tables --
-- there are deliberately no insert/update/delete policies for
-- anon/authenticated below.
alter table team_match_stats enable row level security;
alter table player_match_shot_stats enable row level security;

create policy team_match_stats_public_read
  on team_match_stats
  for select
  to anon, authenticated
  using (true);

create policy player_match_shot_stats_public_read
  on player_match_shot_stats
  for select
  to anon, authenticated
  using (true);
