-- 029_add_fantrax_multi_league.sql
-- Adds encrypted Secret ID storage, a cached multi-league list, and fixes
-- league_rosters so it can safely hold rosters for more than one league per user.

-- ── profiles: Secret ID storage ─────────────────────────────────────────────
-- Encrypted app-side (AES-256-GCM, key from FANTRAX_SECRET_ENCRYPTION_KEY env
-- var) before it ever reaches Postgres. Never decrypted client-side.
alter table profiles add column if not exists fantrax_secret_id_encrypted text;
alter table profiles add column if not exists fantrax_secret_connected_at timestamptz;

-- fantrax_league_id / fantrax_team_id / fantrax_team_name are repurposed as
-- "currently active league/team" rather than "only league" -- no column
-- change needed, existing values remain valid.

-- ── user_fantrax_leagues: cached getLeagues() response ──────────────────────
create table if not exists user_fantrax_leagues (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  league_id text not null,
  league_name text not null,
  team_id text,
  team_name text,
  sport text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, league_id)
);

create index if not exists user_fantrax_leagues_profile_id_idx
  on user_fantrax_leagues (profile_id);

alter table user_fantrax_leagues enable row level security;

drop policy if exists user_fantrax_leagues_own on user_fantrax_leagues;

create policy user_fantrax_leagues_own
  on user_fantrax_leagues
  for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ── league_rosters: fix for multi-league safety ─────────────────────────────
-- Old constraint let the same fantrax_player_id collide across leagues, and
-- the sync route's delete-then-insert wiped ALL of a user's rosters (no
-- league_id scope) -- both silently break as soon as a second league is synced.
alter table league_rosters
  drop constraint if exists league_rosters_profile_id_fantrax_player_id_key;

alter table league_rosters
  add constraint league_rosters_profile_id_league_id_fantrax_player_id_key
  unique (profile_id, league_id, fantrax_player_id);

create index if not exists league_rosters_profile_id_league_id_idx
  on league_rosters (profile_id, league_id);
