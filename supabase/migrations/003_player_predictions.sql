create table if not exists player_predictions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  season text not null,
  gameweek integer not null,
  predicted_pts numeric(5,2),
  form_signal numeric(5,2),
  fixture_score numeric(5,2),
  home_away_adj numeric(5,2),
  consistency_pts numeric(5,2),
  minutes_modifier numeric(4,2),
  volatility_label text,
  generated_at timestamptz default now(),
  unique(player_id, season, gameweek)
);

create index if not exists idx_predictions_gw on player_predictions(season, gameweek);
create index if not exists idx_predictions_player on player_predictions(player_id);

alter table player_predictions enable row level security;

create policy player_predictions_public_read
  on player_predictions
  for select
  to anon, authenticated
  using (true);

create or replace function generate_predictions(p_season text, p_current_gw integer, p_predict_gw integer)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  with fixtures_for_prediction as (
    select
      p.id as player_id,
      p.team,
      p.position,
      case
        when f.home_team = p.team then true
        when f.away_team = p.team then false
        else null
      end as is_home,
      case
        when f.home_team = p.team then f.away_team
        when f.away_team = p.team then f.home_team
        else null
      end as opponent
    from players p
    left join fixtures f
      on f.season = p_season
      and f.gameweek = p_predict_gw
      and (f.home_team = p.team or f.away_team = p.team)
  ),
  history as (
    select
      pg.player_id,
      pg.gameweek,
      pg.games_played,
      pg.games_started,
      pg.minutes_played,
      pg.raw_fantrax_pts::numeric as raw_fantrax_pts,
      pg.ghost_pts::numeric as ghost_pts,
      p.position,
      case
        when hf.home_team = p.team then true
        when hf.away_team = p.team then false
        else null
      end as is_home,
      case
        when hf.home_team = p.team then hf.away_team
        when hf.away_team = p.team then hf.home_team
        else null
      end as opponent
    from player_gameweeks pg
    join players p on p.id = pg.player_id
    left join lateral (
      select f.home_team, f.away_team
      from fixtures f
      where f.season = pg.season
        and f.gameweek = pg.gameweek
        and (f.home_team = p.team or f.away_team = p.team)
      order by f.id
      limit 1
    ) hf on true
    where pg.season = p_season
      and pg.gameweek <= p_current_gw
  ),
  history_started as (
    select *
    from history
    where games_played = 1 and games_started = 1
  ),
  recent_started as (
    select
      h.*,
      row_number() over (partition by h.player_id order by h.gameweek desc) as rn
    from history_started h
  ),
  form_components as (
    select
      player_id,
      sum(raw_fantrax_pts * (6 - rn)) / nullif(sum(6 - rn), 0) as total_form_weighted,
      sum(ghost_pts * (6 - rn)) / nullif(sum(6 - rn), 0) as ghost_floor_weighted
    from recent_started
    where rn <= 5
    group by player_id
  ),
  consistency_components as (
    select
      player_id,
      greatest(0::numeric, 10::numeric - stddev_pop(raw_fantrax_pts)) as consistency_pts
    from recent_started
    where rn <= 6
    group by player_id
  ),
  home_away_stats as (
    select
      player_id,
      avg(raw_fantrax_pts) as overall_avg,
      avg(raw_fantrax_pts) filter (where is_home = true) as home_avg,
      avg(raw_fantrax_pts) filter (where is_home = false) as away_avg,
      count(*) filter (where is_home = true) as home_count,
      count(*) filter (where is_home = false) as away_count
    from history_started
    group by player_id
  ),
  minutes_stats as (
    select
      player_id,
      sum(games_started)::numeric / nullif(sum(games_played), 0)::numeric as starts_rate,
      avg(minutes_played::numeric) filter (where games_started = 1) as avg_mins_when_started,
      sum(games_played) as played_rows
    from history
    where games_played > 0
    group by player_id
  ),
  conceded_by_opponent_position as (
    select
      opponent,
      position,
      (not is_home) as opponent_is_home,
      avg(raw_fantrax_pts) as avg_conceded
    from history_started
    where opponent is not null
      and is_home is not null
    group by opponent, position, (not is_home)
  ),
  conceded_ranges as (
    select
      position,
      opponent_is_home,
      min(avg_conceded) as min_conceded,
      max(avg_conceded) as max_conceded
    from conceded_by_opponent_position
    group by position, opponent_is_home
  ),
  fixture_components as (
    select
      fp.player_id,
      case
        when c.avg_conceded is null then null
        when r.max_conceded = r.min_conceded then 5::numeric
        else ((c.avg_conceded - r.min_conceded) / nullif(r.max_conceded - r.min_conceded, 0)) * 10::numeric
      end as fixture_score
    from fixtures_for_prediction fp
    left join conceded_by_opponent_position c
      on c.opponent = fp.opponent
      and c.position = fp.position
      and c.opponent_is_home = (not fp.is_home)
    left join conceded_ranges r
      on r.position = fp.position
      and r.opponent_is_home = (not fp.is_home)
  ),
  volatility_components as (
    select
      player_id,
      count(*) as sample_size,
      stddev_pop(raw_fantrax_pts) as raw_stddev,
      avg(ghost_pts) as avg_ghost_pts,
      avg(raw_fantrax_pts) as avg_raw_pts
    from recent_started
    where rn <= 6
    group by player_id
  ),
  calculated as (
    select
      fp.player_id,
      p_season as season,
      p_predict_gw as gameweek,
      case
        when fc.total_form_weighted is null then null
        else (fc.total_form_weighted * 0.70) + (fc.ghost_floor_weighted * 0.30)
      end as form_signal,
      fix.fixture_score,
      case
        when has.player_id is null then 0::numeric
        when has.home_count >= 5 and has.away_count >= 5 then
          case when fp.is_home = true then has.home_avg - has.overall_avg else has.away_avg - has.overall_avg end
        else 0::numeric
      end as home_away_adj,
      cc.consistency_pts,
      case
        when ms.played_rows is null or ms.played_rows = 0 then null
        when ms.starts_rate < 0.50 then 0.65::numeric
        else least(coalesce(ms.avg_mins_when_started, 0) / 90::numeric, 1::numeric)
      end as minutes_modifier,
      case
        when vc.sample_size is null or vc.sample_size < 4 then 'insufficient_data'
        when vc.raw_stddev < 4
          and (vc.avg_ghost_pts / nullif(vc.avg_raw_pts, 0)) > 0.40 then 'reliable'
        when vc.raw_stddev > 8
          or (vc.avg_ghost_pts / nullif(vc.avg_raw_pts, 0)) < 0.25 then 'boom_bust'
        else 'mixed'
      end as volatility_label
    from fixtures_for_prediction fp
    left join form_components fc on fc.player_id = fp.player_id
    left join fixture_components fix on fix.player_id = fp.player_id
    left join home_away_stats has on has.player_id = fp.player_id
    left join consistency_components cc on cc.player_id = fp.player_id
    left join minutes_stats ms on ms.player_id = fp.player_id
    left join volatility_components vc on vc.player_id = fp.player_id
  ),
  upserted as (
    insert into player_predictions (
      player_id,
      season,
      gameweek,
      predicted_pts,
      form_signal,
      fixture_score,
      home_away_adj,
      consistency_pts,
      minutes_modifier,
      volatility_label,
      generated_at
    )
    select
      c.player_id,
      c.season,
      c.gameweek,
      round(
        case
          when c.form_signal is null or c.fixture_score is null or c.consistency_pts is null or c.minutes_modifier is null then null
          else (((c.form_signal * 0.50) + (c.fixture_score * 0.30) + (c.home_away_adj * 0.10) + (c.consistency_pts * 0.10)) * c.minutes_modifier)
        end,
        2
      ) as predicted_pts,
      round(c.form_signal, 2) as form_signal,
      round(c.fixture_score, 2) as fixture_score,
      round(c.home_away_adj, 2) as home_away_adj,
      round(c.consistency_pts, 2) as consistency_pts,
      round(c.minutes_modifier, 2) as minutes_modifier,
      c.volatility_label,
      now()
    from calculated c
    on conflict (player_id, season, gameweek)
    do update set
      predicted_pts = excluded.predicted_pts,
      form_signal = excluded.form_signal,
      fixture_score = excluded.fixture_score,
      home_away_adj = excluded.home_away_adj,
      consistency_pts = excluded.consistency_pts,
      minutes_modifier = excluded.minutes_modifier,
      volatility_label = excluded.volatility_label,
      generated_at = excluded.generated_at
    returning 1
  )
  select count(*) into v_rows from upserted;

  return coalesce(v_rows, 0);
end;
$$;
