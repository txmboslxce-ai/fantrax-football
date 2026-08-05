-- Blocks any INSERT/UPDATE/DELETE whose row's `season` value does not match
-- the current season (seasons.is_current = true), on the three tables that
-- carry per-season data: player_gameweeks, fixtures, fpl_player_data.
--
-- Applies to every writer regardless of role -- service_role bypasses RLS
-- but NOT triggers, so this protects admin routes and cron jobs the same
-- as it would anything else. Every current write path in the app already
-- derives its season via getCurrentSeason() rather than a literal/default,
-- so this should be a no-op for all of them once seasons.is_current is set
-- to whatever season they're actually targeting.
create or replace function reject_write_to_closed_season()
returns trigger
language plpgsql
as $$
declare
  row_season text;
  active_season text;
begin
  row_season := case when TG_OP = 'DELETE' then OLD.season else NEW.season end;

  select id into active_season from seasons where is_current = true;

  if active_season is null then
    raise exception 'Cannot write to %: no season is marked as current in the seasons table.', TG_TABLE_NAME;
  end if;

  if row_season is distinct from active_season then
    raise exception 'Cannot write to %: season % is closed, current season is %.',
      TG_TABLE_NAME, row_season, active_season;
  end if;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

drop trigger if exists lock_closed_season on player_gameweeks;
create trigger lock_closed_season
  before insert or update or delete on player_gameweeks
  for each row execute function reject_write_to_closed_season();

drop trigger if exists lock_closed_season on fixtures;
create trigger lock_closed_season
  before insert or update or delete on fixtures
  for each row execute function reject_write_to_closed_season();

drop trigger if exists lock_closed_season on fpl_player_data;
create trigger lock_closed_season
  before insert or update or delete on fpl_player_data
  for each row execute function reject_write_to_closed_season();
