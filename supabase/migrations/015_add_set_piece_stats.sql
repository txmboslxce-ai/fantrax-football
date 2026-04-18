alter table player_gameweeks
  add column if not exists corner_kicks integer default 0,
  add column if not exists free_kick_shots integer default 0;

create or replace view player_prediction_features as
with fixture_players as (
  select
    fx.season,
    fx.gameweek as predict_gameweek,
    p.id as player_id,
    p.name as player_name,
    p.team,
    p.position,
    fx.home_team,
    fx.away_team,
    case
      when fx.home_team = p.team then true
      when fx.away_team = p.team then false
      else null
    end as is_home,
    case
      when fx.home_team = p.team then fx.away_team
      when fx.away_team = p.team then fx.home_team
      else null
    end as opponent
  from fixtures fx
  join players p
    on p.team in (fx.home_team, fx.away_team)
),
player_history as (
  select
    pg.player_id,
    pg.season,
    pg.gameweek,
    pg.games_played,
    pg.games_started,
    pg.minutes_played::numeric as minutes_played,
    pg.raw_fantrax_pts::numeric as raw_fantrax_pts,
    pg.ghost_pts::numeric as ghost_pts,
    pg.goals::numeric as goals,
    pg.assists::numeric as assists,
    pg.clean_sheet::numeric as clean_sheet,
    pg.saves::numeric as saves,
    pg.goals_against::numeric as goals_against,
    pg.goals_against_outfield::numeric as goals_against_outfield,
    pg.key_passes::numeric as key_passes,
    pg.shots_on_target::numeric as shots_on_target,
    pg.tackles_won::numeric as tackles_won,
    pg.interceptions::numeric as interceptions,
    pg.clearances::numeric as clearances,
    pg.accurate_crosses::numeric as accurate_crosses,
    pg.blocked_shots::numeric as blocked_shots,
    pg.aerials_won::numeric as aerials_won,
    pg.dribbles_succeeded::numeric as dribbles_succeeded,
    pg.dispossessed::numeric as dispossessed,
    pg.subbed_on::numeric as subbed_on,
    pg.subbed_off::numeric as subbed_off,
    pg.corner_kicks::numeric as corner_kicks,
    pg.free_kick_shots::numeric as free_kick_shots
  from player_gameweeks pg
),
history_windows as (
  select
    fp.season,
    fp.predict_gameweek,
    fp.player_id,
    count(*) filter (where ph.gameweek < fp.predict_gameweek) as season_sample_all,
    count(*) filter (where ph.gameweek < fp.predict_gameweek and ph.games_played > 0) as season_appearances,
    count(*) filter (where ph.gameweek < fp.predict_gameweek and ph.games_started > 0) as season_starts,
    sum(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek) as season_minutes,
    sum(ph.ghost_pts) filter (where ph.gameweek < fp.predict_gameweek) as season_ghost_pts,
    sum(ph.goals) filter (where ph.gameweek < fp.predict_gameweek) as season_goals,
    sum(ph.assists) filter (where ph.gameweek < fp.predict_gameweek) as season_assists,
    sum(ph.clean_sheet) filter (where ph.gameweek < fp.predict_gameweek) as season_clean_sheets,
    sum(ph.saves) filter (where ph.gameweek < fp.predict_gameweek) as season_saves,
    sum(ph.goals_against) filter (where ph.gameweek < fp.predict_gameweek) as season_goals_against,
    sum(ph.goals_against_outfield) filter (where ph.gameweek < fp.predict_gameweek) as season_goals_against_outfield,
    sum(ph.key_passes) filter (where ph.gameweek < fp.predict_gameweek) as season_key_passes,
    sum(ph.shots_on_target) filter (where ph.gameweek < fp.predict_gameweek) as season_shots_on_target,
    sum(ph.tackles_won) filter (where ph.gameweek < fp.predict_gameweek) as season_tackles_won,
    sum(ph.interceptions) filter (where ph.gameweek < fp.predict_gameweek) as season_interceptions,
    sum(ph.clearances) filter (where ph.gameweek < fp.predict_gameweek) as season_clearances,
    sum(ph.accurate_crosses) filter (where ph.gameweek < fp.predict_gameweek) as season_accurate_crosses,
    sum(ph.blocked_shots) filter (where ph.gameweek < fp.predict_gameweek) as season_blocked_shots,
    sum(ph.aerials_won) filter (where ph.gameweek < fp.predict_gameweek) as season_aerials_won,
    sum(ph.dribbles_succeeded) filter (where ph.gameweek < fp.predict_gameweek) as season_dribbles_succeeded,
    sum(ph.dispossessed) filter (where ph.gameweek < fp.predict_gameweek) as season_dispossessed,
    sum(ph.corner_kicks) filter (where ph.gameweek < fp.predict_gameweek) as season_corner_kicks,
    sum(ph.free_kick_shots) filter (where ph.gameweek < fp.predict_gameweek) as season_free_kick_shots,
    avg(ph.raw_fantrax_pts) filter (where ph.gameweek < fp.predict_gameweek and ph.games_started > 0) as season_avg_pts_per_start,
    avg(ph.ghost_pts) filter (where ph.gameweek < fp.predict_gameweek and ph.games_started > 0) as season_avg_ghost_per_start,
    avg(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.games_started > 0) as season_avg_minutes_if_start,
    avg(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.games_played > 0 and ph.games_started = 0) as season_avg_minutes_if_bench,
    avg(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.games_played > 0) as season_avg_minutes,
    avg(ph.games_started::numeric) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_start_rate,
    avg(ph.games_played::numeric) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_appearance_rate,
    avg(ph.games_started::numeric) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_start_rate,
    avg(ph.games_played::numeric) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_appearance_rate,
    avg(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10 and ph.games_started > 0) as last10_avg_minutes_if_start,
    avg(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10 and ph.games_played > 0 and ph.games_started = 0) as last10_avg_minutes_if_bench,
    avg(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5 and ph.games_started > 0) as last5_avg_minutes_if_start,
    avg(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5 and ph.games_played > 0 and ph.games_started = 0) as last5_avg_minutes_if_bench,
    sum(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_minutes,
    sum(ph.minutes_played) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_minutes,
    sum(ph.ghost_pts) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_ghost_pts,
    sum(ph.ghost_pts) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_ghost_pts,
    sum(ph.goals) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_goals,
    sum(ph.goals) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_goals,
    sum(ph.assists) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_assists,
    sum(ph.assists) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_assists,
    sum(ph.clean_sheet) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_clean_sheets,
    sum(ph.clean_sheet) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_clean_sheets,
    sum(ph.saves) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_saves,
    sum(ph.saves) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_saves,
    sum(ph.goals_against) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_goals_against,
    sum(ph.goals_against) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_goals_against,
    sum(ph.goals_against_outfield) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_goals_against_outfield,
    sum(ph.goals_against_outfield) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_goals_against_outfield,
    sum(ph.key_passes) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_key_passes,
    sum(ph.key_passes) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_key_passes,
    sum(ph.shots_on_target) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_shots_on_target,
    sum(ph.shots_on_target) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_shots_on_target,
    sum(ph.tackles_won) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_tackles_won,
    sum(ph.tackles_won) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_tackles_won,
    sum(ph.interceptions) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_interceptions,
    sum(ph.interceptions) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_interceptions,
    sum(ph.clearances) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_clearances,
    sum(ph.clearances) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_clearances,
    sum(ph.accurate_crosses) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_accurate_crosses,
    sum(ph.accurate_crosses) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_accurate_crosses,
    sum(ph.blocked_shots) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_blocked_shots,
    sum(ph.blocked_shots) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_blocked_shots,
    sum(ph.aerials_won) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_aerials_won,
    sum(ph.aerials_won) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_aerials_won,
    sum(ph.dribbles_succeeded) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_dribbles_succeeded,
    sum(ph.dribbles_succeeded) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_dribbles_succeeded,
    sum(ph.dispossessed) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_dispossessed,
    sum(ph.dispossessed) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_dispossessed,
    sum(ph.corner_kicks) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_corner_kicks,
    sum(ph.corner_kicks) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_corner_kicks,
    sum(ph.free_kick_shots) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_free_kick_shots,
    sum(ph.free_kick_shots) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_free_kick_shots,
    avg(ph.subbed_on) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_avg_subbed_on,
    avg(ph.subbed_off) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 10) as last10_avg_subbed_off,
    avg(ph.subbed_on) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_avg_subbed_on,
    avg(ph.subbed_off) filter (where ph.gameweek < fp.predict_gameweek and ph.gameweek >= fp.predict_gameweek - 5) as last5_avg_subbed_off
  from fixture_players fp
  left join player_history ph
    on ph.player_id = fp.player_id
    and ph.season = fp.season
  group by fp.season, fp.predict_gameweek, fp.player_id
)
select
  fp.season,
  fp.predict_gameweek as gameweek,
  fp.player_id,
  fp.player_name,
  fp.team,
  fp.position,
  fp.is_home,
  fp.opponent,
  hw.season_sample_all,
  hw.season_appearances,
  hw.season_starts,
  round(coalesce(hw.season_starts::numeric / nullif(hw.season_sample_all, 0), 0), 4) as season_start_rate,
  round(coalesce(hw.season_appearances::numeric / nullif(hw.season_sample_all, 0), 0), 4) as season_appearance_rate,
  round(coalesce(hw.season_minutes, 0), 2) as season_minutes,
  round(coalesce((hw.season_ghost_pts / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_ghost_pts_per90,
  round(coalesce((hw.season_goals / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_goals_per90,
  round(coalesce((hw.season_assists / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_assists_per90,
  round(coalesce((hw.season_clean_sheets / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_clean_sheets_per90,
  round(coalesce((hw.season_saves / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_saves_per90,
  round(coalesce((hw.season_goals_against / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_goals_against_per90,
  round(coalesce((hw.season_goals_against_outfield / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_goals_against_outfield_per90,
  round(coalesce((hw.season_key_passes / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_key_passes_per90,
  round(coalesce((hw.season_shots_on_target / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_shots_on_target_per90,
  round(coalesce((hw.season_tackles_won / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_tackles_won_per90,
  round(coalesce((hw.season_interceptions / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_interceptions_per90,
  round(coalesce((hw.season_clearances / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_clearances_per90,
  round(coalesce((hw.season_accurate_crosses / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_accurate_crosses_per90,
  round(coalesce((hw.season_blocked_shots / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_blocked_shots_per90,
  round(coalesce((hw.season_aerials_won / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_aerials_won_per90,
  round(coalesce((hw.season_dribbles_succeeded / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_dribbles_succeeded_per90,
  round(coalesce((hw.season_dispossessed / nullif(hw.season_minutes, 0)) * 90.0, 0), 4) as season_dispossessed_per90,
  case when hw.season_minutes >= 90 then round((hw.season_corner_kicks / hw.season_minutes) * 90.0, 4) else null end as season_corner_kicks_per90,
  case when hw.season_minutes >= 90 then round((hw.season_free_kick_shots / hw.season_minutes) * 90.0, 4) else null end as season_free_kick_shots_per90,
  round(coalesce(hw.season_avg_pts_per_start, 0), 4) as season_avg_pts_per_start,
  round(coalesce(hw.season_avg_ghost_per_start, 0), 4) as season_avg_ghost_per_start,
  round(coalesce(hw.season_avg_minutes_if_start, 0), 4) as season_avg_minutes_if_start,
  round(coalesce(hw.season_avg_minutes_if_bench, 0), 4) as season_avg_minutes_if_bench,
  round(coalesce(hw.season_avg_minutes, 0), 4) as season_avg_minutes,
  round(coalesce(hw.last10_start_rate, 0), 4) as last10_start_rate,
  round(coalesce(hw.last10_appearance_rate, 0), 4) as last10_appearance_rate,
  round(coalesce(hw.last5_start_rate, 0), 4) as last5_start_rate,
  round(coalesce(hw.last5_appearance_rate, 0), 4) as last5_appearance_rate,
  round(coalesce(hw.last10_avg_minutes_if_start, 0), 4) as last10_avg_minutes_if_start,
  round(coalesce(hw.last10_avg_minutes_if_bench, 0), 4) as last10_avg_minutes_if_bench,
  round(coalesce(hw.last5_avg_minutes_if_start, 0), 4) as last5_avg_minutes_if_start,
  round(coalesce(hw.last5_avg_minutes_if_bench, 0), 4) as last5_avg_minutes_if_bench,
  round(coalesce((hw.last10_ghost_pts / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_ghost_pts_per90,
  round(coalesce((hw.last10_goals / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_goals_per90,
  round(coalesce((hw.last10_assists / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_assists_per90,
  round(coalesce((hw.last10_clean_sheets / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_clean_sheets_per90,
  round(coalesce((hw.last10_saves / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_saves_per90,
  round(coalesce((hw.last10_goals_against / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_goals_against_per90,
  round(coalesce((hw.last10_goals_against_outfield / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_goals_against_outfield_per90,
  round(coalesce((hw.last10_key_passes / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_key_passes_per90,
  round(coalesce((hw.last10_shots_on_target / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_shots_on_target_per90,
  round(coalesce((hw.last10_tackles_won / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_tackles_won_per90,
  round(coalesce((hw.last10_interceptions / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_interceptions_per90,
  round(coalesce((hw.last10_clearances / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_clearances_per90,
  round(coalesce((hw.last10_accurate_crosses / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_accurate_crosses_per90,
  round(coalesce((hw.last10_blocked_shots / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_blocked_shots_per90,
  round(coalesce((hw.last10_aerials_won / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_aerials_won_per90,
  round(coalesce((hw.last10_dribbles_succeeded / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_dribbles_succeeded_per90,
  round(coalesce((hw.last10_dispossessed / nullif(hw.last10_minutes, 0)) * 90.0, 0), 4) as last10_dispossessed_per90,
  case when hw.last10_minutes >= 90 then round((hw.last10_corner_kicks / hw.last10_minutes) * 90.0, 4) else null end as last10_corner_kicks_per90,
  case when hw.last10_minutes >= 90 then round((hw.last10_free_kick_shots / hw.last10_minutes) * 90.0, 4) else null end as last10_free_kick_shots_per90,
  round(coalesce((hw.last5_ghost_pts / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_ghost_pts_per90,
  round(coalesce((hw.last5_goals / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_goals_per90,
  round(coalesce((hw.last5_assists / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_assists_per90,
  round(coalesce((hw.last5_clean_sheets / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_clean_sheets_per90,
  round(coalesce((hw.last5_saves / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_saves_per90,
  round(coalesce((hw.last5_goals_against / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_goals_against_per90,
  round(coalesce((hw.last5_goals_against_outfield / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_goals_against_outfield_per90,
  round(coalesce((hw.last5_key_passes / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_key_passes_per90,
  round(coalesce((hw.last5_shots_on_target / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_shots_on_target_per90,
  round(coalesce((hw.last5_tackles_won / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_tackles_won_per90,
  round(coalesce((hw.last5_interceptions / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_interceptions_per90,
  round(coalesce((hw.last5_clearances / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_clearances_per90,
  round(coalesce((hw.last5_accurate_crosses / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_accurate_crosses_per90,
  round(coalesce((hw.last5_blocked_shots / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_blocked_shots_per90,
  round(coalesce((hw.last5_aerials_won / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_aerials_won_per90,
  round(coalesce((hw.last5_dribbles_succeeded / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_dribbles_succeeded_per90,
  round(coalesce((hw.last5_dispossessed / nullif(hw.last5_minutes, 0)) * 90.0, 0), 4) as last5_dispossessed_per90,
  case when hw.last5_minutes >= 90 then round((hw.last5_corner_kicks / hw.last5_minutes) * 90.0, 4) else null end as last5_corner_kicks_per90,
  case when hw.last5_minutes >= 90 then round((hw.last5_free_kick_shots / hw.last5_minutes) * 90.0, 4) else null end as last5_free_kick_shots_per90,
  round(coalesce(hw.last10_avg_subbed_on, 0), 4) as last10_avg_subbed_on,
  round(coalesce(hw.last10_avg_subbed_off, 0), 4) as last10_avg_subbed_off,
  round(coalesce(hw.last5_avg_subbed_on, 0), 4) as last5_avg_subbed_on,
  round(coalesce(hw.last5_avg_subbed_off, 0), 4) as last5_avg_subbed_off,
  round(
    coalesce(
      (coalesce(hw.last5_start_rate, hw.last10_start_rate, 0) * 0.50) +
      (coalesce(hw.last10_start_rate, hw.last5_start_rate, 0) * 0.30) +
      (coalesce(hw.season_starts::numeric / nullif(hw.season_sample_all, 0), 0) * 0.20),
      0
    ),
    4
  ) as expected_start_probability_input,
  round(
    coalesce(
      (coalesce(hw.last5_avg_minutes_if_start, hw.last10_avg_minutes_if_start, hw.season_avg_minutes_if_start, 0) * 0.50) +
      (coalesce(hw.last10_avg_minutes_if_start, hw.season_avg_minutes_if_start, hw.last5_avg_minutes_if_start, 0) * 0.30) +
      (coalesce(hw.season_avg_minutes_if_start, hw.last10_avg_minutes_if_start, hw.last5_avg_minutes_if_start, 0) * 0.20),
      0
    ),
    4
  ) as expected_minutes_if_start_input,
  round(
    coalesce(
      (coalesce(hw.last5_avg_minutes_if_bench, hw.last10_avg_minutes_if_bench, hw.season_avg_minutes_if_bench, 0) * 0.50) +
      (coalesce(hw.last10_avg_minutes_if_bench, hw.season_avg_minutes_if_bench, hw.last5_avg_minutes_if_bench, 0) * 0.30) +
      (coalesce(hw.season_avg_minutes_if_bench, hw.last10_avg_minutes_if_bench, hw.last5_avg_minutes_if_bench, 0) * 0.20),
      0
    ),
    4
  ) as expected_minutes_if_bench_input,
  round(
    coalesce(
      (
        coalesce(
          (coalesce(hw.last5_start_rate, hw.last10_start_rate, 0) * 0.50) +
          (coalesce(hw.last10_start_rate, hw.last5_start_rate, 0) * 0.30) +
          (coalesce(hw.season_starts::numeric / nullif(hw.season_sample_all, 0), 0) * 0.20),
          0
        )
        *
        coalesce(
          (coalesce(hw.last5_avg_minutes_if_start, hw.last10_avg_minutes_if_start, hw.season_avg_minutes_if_start, 0) * 0.50) +
          (coalesce(hw.last10_avg_minutes_if_start, hw.season_avg_minutes_if_start, hw.last5_avg_minutes_if_start, 0) * 0.30) +
          (coalesce(hw.season_avg_minutes_if_start, hw.last10_avg_minutes_if_start, hw.last5_avg_minutes_if_start, 0) * 0.20),
          0
        )
      ) +
      (
        greatest(
          coalesce(
            (coalesce(hw.last5_appearance_rate, hw.last10_appearance_rate, 0) * 0.50) +
            (coalesce(hw.last10_appearance_rate, hw.last5_appearance_rate, 0) * 0.30) +
            (coalesce(hw.season_appearances::numeric / nullif(hw.season_sample_all, 0), 0) * 0.20),
            0
          ) -
          coalesce(
            (coalesce(hw.last5_start_rate, hw.last10_start_rate, 0) * 0.50) +
            (coalesce(hw.last10_start_rate, hw.last5_start_rate, 0) * 0.30) +
            (coalesce(hw.season_starts::numeric / nullif(hw.season_sample_all, 0), 0) * 0.20),
            0
          ),
          0
        )
        *
        coalesce(
          (coalesce(hw.last5_avg_minutes_if_bench, hw.last10_avg_minutes_if_bench, hw.season_avg_minutes_if_bench, 0) * 0.50) +
          (coalesce(hw.last10_avg_minutes_if_bench, hw.season_avg_minutes_if_bench, hw.last5_avg_minutes_if_bench, 0) * 0.30) +
          (coalesce(hw.season_avg_minutes_if_bench, hw.last10_avg_minutes_if_bench, hw.last5_avg_minutes_if_bench, 0) * 0.20),
          0
        )
      ),
      0
    ),
    4
  ) as expected_minutes_input,
  round(coalesce(oa.ghost_pts_multiplier, 1), 4) as opponent_ghost_pts_multiplier,
  round(coalesce(oa.goals_multiplier, 1), 4) as opponent_goals_multiplier,
  round(coalesce(oa.assists_multiplier, 1), 4) as opponent_assists_multiplier,
  round(coalesce(oa.clean_sheets_multiplier, 1), 4) as opponent_clean_sheets_multiplier,
  round(coalesce(oa.saves_multiplier, 1), 4) as opponent_saves_multiplier,
  round(coalesce(oa.goals_against_multiplier, 1), 4) as opponent_goals_against_multiplier,
  round(coalesce(oa.goals_against_outfield_multiplier, 1), 4) as opponent_goals_against_outfield_multiplier,
  round(coalesce(oa.key_passes_multiplier, 1), 4) as opponent_key_passes_multiplier,
  round(coalesce(oa.shots_on_target_multiplier, 1), 4) as opponent_shots_on_target_multiplier,
  round(coalesce(oa.tackles_won_multiplier, 1), 4) as opponent_tackles_won_multiplier,
  round(coalesce(oa.interceptions_multiplier, 1), 4) as opponent_interceptions_multiplier,
  round(coalesce(oa.clearances_multiplier, 1), 4) as opponent_clearances_multiplier,
  round(coalesce(oa.accurate_crosses_multiplier, 1), 4) as opponent_accurate_crosses_multiplier,
  round(coalesce(oa.blocked_shots_multiplier, 1), 4) as opponent_blocked_shots_multiplier,
  round(coalesce(oa.aerials_multiplier, 1), 4) as opponent_aerials_multiplier,
  round(coalesce(oa.dribbles_multiplier, 1), 4) as opponent_dribbles_multiplier,
  round(coalesce(oa.dispossessed_multiplier, 1), 4) as opponent_dispossessed_multiplier,
  oa.sample_matches as opponent_adjustment_samples,
  round(coalesce(tc.clean_sheet_rate, 0), 4) as team_clean_sheet_rate,
  round(coalesce(tc.avg_goals_against, 0), 4) as team_avg_goals_against,
  round(coalesce(tc.avg_saves, 0), 4) as team_avg_saves,
  round(coalesce(tc.clean_sheet_strength, 1), 4) as team_clean_sheet_strength,
  round(coalesce(tc.goals_against_strength, 1), 4) as team_goals_against_strength,
  round(coalesce(tc.saves_strength, 1), 4) as team_saves_strength,
  round(coalesce(fpd.chance_of_playing_next_round, 100) / 100.0, 4) as availability_probability,
  fpd.status as fpl_status,
  fpd.news as fpl_news,
  round(coalesce(fpd.starts_per_90, 0), 4) as fpl_starts_per_90,
  round(coalesce(fpd.expected_goals_per_90, 0), 4) as fpl_expected_goals_per_90,
  round(coalesce(fpd.expected_assists_per_90, 0), 4) as fpl_expected_assists_per_90,
  round(coalesce(fpd.clean_sheets_per_90, 0), 4) as fpl_clean_sheets_per_90,
  round(coalesce(fpd.expected_goals_conceded_per_90, 0), 4) as fpl_expected_goals_conceded_per_90,
  round(coalesce(fpd.saves_per_90, 0), 4) as fpl_saves_per_90,
  fpd.penalties_order,
  fpd.corners_order,
  fpd.direct_freekicks_order
from fixture_players fp
left join history_windows hw
  on hw.season = fp.season
  and hw.predict_gameweek = fp.predict_gameweek
  and hw.player_id = fp.player_id
left join player_prediction_opponent_adjustments oa
  on oa.season = fp.season
  and oa.opponent = fp.opponent
  and oa.position = fp.position
  and oa.opponent_is_home = (not fp.is_home)
left join player_prediction_team_context tc
  on tc.season = fp.season
  and tc.team_abbrev = fp.team
  and tc.team_is_home = fp.is_home
left join fpl_player_data fpd
  on fpd.player_id = fp.player_id;
