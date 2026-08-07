alter table public.seasons
  add column if not exists fantrax_season_projection_code text;

update public.seasons
set fantrax_season_projection_code = case id
  when '2025-26' then 'SEASON_925_BY_PERIOD'
  when '2026-27' then 'SEASON_926_BY_PERIOD'
end
where id in ('2025-26', '2026-27');
