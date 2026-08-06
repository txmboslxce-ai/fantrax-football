-- Run only after migration 018_add_season_fantrax_league_id.sql.
-- Stores the Fantrax source league for each historical season so score syncs
-- never infer a historical league from the mutable FANTRAX_LEAGUE_ID fallback.

begin;

do $$
declare
  matched_season_count integer;
begin
  select count(*) into matched_season_count
  from public.seasons
  where id in ('2025-26', '2026-27');

  if matched_season_count <> 2 then
    raise exception 'Expected seasons 2025-26 and 2026-27 before populating Fantrax league IDs; found %.', matched_season_count;
  end if;
end;
$$;

update public.seasons
set fantrax_league_id = case id
  when '2025-26' then 'rll4dvajmeahdzar'
  when '2026-27' then 'inas2ifkms3zqw8q'
end
where id in ('2025-26', '2026-27');

do $$
declare
  configured_count integer;
  distinct_id_count integer;
begin
  select count(*), count(distinct fantrax_league_id)
  into configured_count, distinct_id_count
  from public.seasons
  where id in ('2025-26', '2026-27')
    and nullif(trim(fantrax_league_id), '') is not null;

  if configured_count <> 2 or distinct_id_count <> 2 then
    raise exception 'Fantrax league-ID verification failed: configured=%, distinct=%.', configured_count, distinct_id_count;
  end if;
end;
$$;

select id, fantrax_league_id
from public.seasons
where id in ('2025-26', '2026-27')
order by id;

commit;
