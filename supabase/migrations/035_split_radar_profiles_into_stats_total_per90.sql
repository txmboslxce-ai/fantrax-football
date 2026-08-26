-- Replaces the separate 'attacking' and 'defensive' radar profiles with a
-- single merged "Stats" profile, stored twice: once as season totals and
-- once as per-90 rates. lib/portal/summaryRecompute.ts now writes
-- 'stats_total' and 'stats_per90' instead of 'attacking' and 'defensive'.
-- 'fantasy' and 'goalkeeper' are unchanged.
alter table public.player_radar_profiles
  drop constraint if exists player_radar_profiles_profile_check;

alter table public.player_radar_profiles
  add constraint player_radar_profiles_profile_check
  check (profile in ('fantasy', 'stats_total', 'stats_per90', 'goalkeeper'));

-- Drop the now-unused rows rather than leaving stale data the app no
-- longer reads; the next recompute (triggered automatically by the next
-- score sync, or manually via /api/admin/recompute-summaries) repopulates
-- 'stats_total' and 'stats_per90' for every player.
delete from public.player_radar_profiles where profile in ('attacking', 'defensive');
