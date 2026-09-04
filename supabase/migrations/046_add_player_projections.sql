-- Phase 4 of the stats-based projection model: the assembled output. Each
-- row is one player's projected stat line for one upcoming fixture, built
-- from team strength ratings (lib/projections/teamStrength.ts) and player
-- shot profiles (lib/projections/playerShotProfile.ts), then run through
-- the same calcOutfielderPts/calcKeeperPts formula that scores real
-- results -- see lib/projections/playerProjection.ts for the assembly.
--
-- Persisted (not just computed on demand) so a projection can be compared
-- against the real outcome after the fact, and so recomputing later
-- doesn't silently rewrite what was actually shown before kickoff.
create table if not exists player_projections (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  fixture_id uuid not null references fixtures(id) on delete cascade,
  season text not null,
  gameweek integer not null,
  opponent_abbrev text not null,
  is_home boolean not null,
  expected_minutes numeric(5, 2) not null,
  projected_score numeric(6, 2) not null,
  -- Every individual projected input (goals, assists, clean_sheet
  -- probability, key_passes, shots_on_target, tackles_won, etc.) verbatim,
  -- so the headline number is never a black box -- see PlayerProjection in
  -- lib/projections/playerProjection.ts for the exact shape.
  stat_line jsonb not null,
  computed_at timestamptz not null default now(),
  unique (player_id, season, gameweek)
);

create index if not exists player_projections_gameweek_idx on player_projections (season, gameweek);

alter table player_projections enable row level security;

create policy player_projections_public_read
  on player_projections
  for select
  to anon, authenticated
  using (true);
