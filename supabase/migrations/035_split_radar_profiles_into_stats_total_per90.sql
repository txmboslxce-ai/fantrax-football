-- Replaces the separate 'attacking' and 'defensive' radar profiles with a
-- single merged "Stats" profile, stored twice: once as season totals and
-- once as per-90 rates. lib/portal/summaryRecompute.ts now writes
-- 'stats_total' and 'stats_per90' instead of 'attacking' and 'defensive'.
-- 'fantasy' and 'goalkeeper' are unchanged.
-- Delete the now-unused rows *before* tightening the constraint below —
-- adding a check constraint validates every existing row against it, so
-- doing this after would fail on any 'attacking'/'defensive' row still in
-- the table. These rows are pure cache (recomputed fresh from real scores
-- every time the recompute job runs), so deleting them loses nothing the
-- app can still read.
delete from public.player_radar_profiles where profile in ('attacking', 'defensive');

alter table public.player_radar_profiles
  drop constraint if exists player_radar_profiles_profile_check;

alter table public.player_radar_profiles
  add constraint player_radar_profiles_profile_check
  check (profile in ('fantasy', 'stats_total', 'stats_per90', 'goalkeeper'));
