-- Manual per-fixture correction for the Lineups pitch graphic, for when
-- BSD's own data is wrong -- either its `formation` string (e.g. reporting
-- "3-4-3" for what was actually played as 3-4-2-1) or, before BSD's
-- average-positions data is populated (typically not until close to full
-- time), its raw starters array order not reflecting which flank a player
-- actually played. Once set for a fixture/side, this fully replaces the
-- auto-derived layout for that side -- it doesn't get reconciled with BSD's
-- own data later, since there's no guarantee that data is right either.
create table if not exists fixture_lineup_overrides (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures(id) on delete cascade,
  is_home boolean not null,
  formation text not null,
  -- BSD player ids for all 11 starters, flattened in line-by-line,
  -- left-to-right reading order matching `formation` (e.g. for "4-3-3":
  -- GK, then the 4 defenders left-to-right, then the 3 midfielders, then
  -- the 3 forwards).
  starter_bsd_ids integer[] not null,
  updated_at timestamptz not null default now(),
  unique (fixture_id, is_home)
);

-- Writes go through /api/admin/fixture-lineup-override using the
-- service-role client (bypasses RLS), matching the rest of the app's
-- admin-only-write tables -- there are deliberately no insert/update/
-- delete policies for anon/authenticated below.
alter table fixture_lineup_overrides enable row level security;

create policy fixture_lineup_overrides_public_read
  on fixture_lineup_overrides
  for select
  to anon, authenticated
  using (true);
