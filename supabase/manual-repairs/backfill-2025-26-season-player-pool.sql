-- Run after migration 019_create_season_player_pool.sql.
-- Expected final pool count for 2025-26: 1,098.

begin;

insert into public.season_player_pool (season, fantrax_id)
select '2025-26', p.fantrax_id
from public.player_gameweeks pg
join public.players p on p.id = pg.player_id
where pg.season = '2025-26'
  and nullif(trim(p.fantrax_id), '') is not null
group by p.fantrax_id
on conflict (season, fantrax_id) do nothing;

select count(*) as pool_count
from public.season_player_pool
where season = '2025-26';

commit;
