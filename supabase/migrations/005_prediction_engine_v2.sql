alter table player_predictions
  add column if not exists start_probability numeric(5,4),
  add column if not exists expected_minutes numeric(5,2),
  add column if not exists predicted_ghost_pts numeric(6,2),
  add column if not exists predicted_goal_pts numeric(6,2),
  add column if not exists predicted_assist_pts numeric(6,2),
  add column if not exists predicted_cs_pts numeric(6,2),
  add column if not exists predicted_save_pts numeric(6,2),
  add column if not exists predicted_ga_penalty numeric(6,2),
  add column if not exists predicted_total_pts numeric(6,2),
  add column if not exists floor_pts numeric(6,2),
  add column if not exists ceiling_pts numeric(6,2),
  add column if not exists confidence_score numeric(5,2);

create index if not exists idx_predictions_total_pts on player_predictions(season, gameweek, predicted_total_pts desc);

alter table player_gameweeks
  add column if not exists dispossessed integer default 0;

alter table fpl_player_data
  add column if not exists clean_sheets_per_90 numeric(5,3),
  add column if not exists expected_goals_conceded_per_90 numeric(5,3),
  add column if not exists saves_per_90 numeric(5,3);

create or replace view player_prediction_opponent_adjustments as
with player_fixture_history as (
  select
    pg.player_id,
    pg.season,
    pg.gameweek,
    p.position,
    p.team as player_team,
    case
      when f.home_team = p.team then false
      when f.away_team = p.team then true
      else null
    end as opponent_is_home,
    case
      when f.home_team = p.team then f.away_team
      when f.away_team = p.team then f.home_team
      else null
    end as opponent,
    pg.minutes_played::numeric as minutes_played,
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
    pg.dispossessed::numeric as dispossessed
  from player_gameweeks pg
  join players p
    on p.id = pg.player_id
  left join lateral (
    select fx.home_team, fx.away_team
    from fixtures fx
    where fx.season = pg.season
      and fx.gameweek = pg.gameweek
      and (fx.home_team = p.team or fx.away_team = p.team)
    order by fx.id
    limit 1
  ) f on true
  where pg.games_played > 0
),
opponent_base as (
  select
    season,
    opponent,
    position,
    opponent_is_home,
    count(*) as sample_matches,
    sum(minutes_played) as total_minutes,
    sum(ghost_pts) as total_ghost_pts,
    sum(goals) as total_goals,
    sum(assists) as total_assists,
    sum(clean_sheet) as total_clean_sheets,
    sum(saves) as total_saves,
    sum(goals_against) as total_goals_against,
    sum(goals_against_outfield) as total_goals_against_outfield,
    sum(key_passes) as total_key_passes,
    sum(shots_on_target) as total_shots_on_target,
    sum(tackles_won) as total_tackles_won,
    sum(interceptions) as total_interceptions,
    sum(clearances) as total_clearances,
    sum(accurate_crosses) as total_accurate_crosses,
    sum(blocked_shots) as total_blocked_shots,
    sum(aerials_won) as total_aerials_won,
    sum(dribbles_succeeded) as total_dribbles_succeeded,
    sum(dispossessed) as total_dispossessed
  from player_fixture_history
  where opponent is not null
    and opponent_is_home is not null
  group by season, opponent, position, opponent_is_home
),
opponent_rates as (
  select
    season,
    opponent,
    position,
    opponent_is_home,
    sample_matches,
    total_minutes,
    round((total_ghost_pts / nullif(total_minutes, 0)) * 90.0, 4) as ghost_pts_allowed_per90,
    round((total_goals / nullif(total_minutes, 0)) * 90.0, 4) as goals_allowed_per90,
    round((total_assists / nullif(total_minutes, 0)) * 90.0, 4) as assists_allowed_per90,
    round((total_clean_sheets / nullif(total_minutes, 0)) * 90.0, 4) as clean_sheets_allowed_per90,
    round((total_saves / nullif(total_minutes, 0)) * 90.0, 4) as saves_allowed_per90,
    round((total_goals_against / nullif(total_minutes, 0)) * 90.0, 4) as goals_against_allowed_per90,
    round((total_goals_against_outfield / nullif(total_minutes, 0)) * 90.0, 4) as goals_against_outfield_allowed_per90,
    round((total_key_passes / nullif(total_minutes, 0)) * 90.0, 4) as key_passes_allowed_per90,
    round((total_shots_on_target / nullif(total_minutes, 0)) * 90.0, 4) as shots_on_target_allowed_per90,
    round((total_tackles_won / nullif(total_minutes, 0)) * 90.0, 4) as tackles_won_allowed_per90,
    round((total_interceptions / nullif(total_minutes, 0)) * 90.0, 4) as interceptions_allowed_per90,
    round((total_clearances / nullif(total_minutes, 0)) * 90.0, 4) as clearances_allowed_per90,
    round((total_accurate_crosses / nullif(total_minutes, 0)) * 90.0, 4) as accurate_crosses_allowed_per90,
    round((total_blocked_shots / nullif(total_minutes, 0)) * 90.0, 4) as blocked_shots_allowed_per90,
    round((total_aerials_won / nullif(total_minutes, 0)) * 90.0, 4) as aerials_allowed_per90,
    round((total_dribbles_succeeded / nullif(total_minutes, 0)) * 90.0, 4) as dribbles_allowed_per90,
    round((total_dispossessed / nullif(total_minutes, 0)) * 90.0, 4) as dispossessed_allowed_per90
  from opponent_base
),
position_venue_baseline as (
  select
    season,
    position,
    opponent_is_home,
    avg(ghost_pts_allowed_per90) as avg_ghost_pts_allowed_per90,
    avg(goals_allowed_per90) as avg_goals_allowed_per90,
    avg(assists_allowed_per90) as avg_assists_allowed_per90,
    avg(clean_sheets_allowed_per90) as avg_clean_sheets_allowed_per90,
    avg(saves_allowed_per90) as avg_saves_allowed_per90,
    avg(goals_against_allowed_per90) as avg_goals_against_allowed_per90,
    avg(goals_against_outfield_allowed_per90) as avg_goals_against_outfield_allowed_per90,
    avg(key_passes_allowed_per90) as avg_key_passes_allowed_per90,
    avg(shots_on_target_allowed_per90) as avg_shots_on_target_allowed_per90,
    avg(tackles_won_allowed_per90) as avg_tackles_won_allowed_per90,
    avg(interceptions_allowed_per90) as avg_interceptions_allowed_per90,
    avg(clearances_allowed_per90) as avg_clearances_allowed_per90,
    avg(accurate_crosses_allowed_per90) as avg_accurate_crosses_allowed_per90,
    avg(blocked_shots_allowed_per90) as avg_blocked_shots_allowed_per90,
    avg(aerials_allowed_per90) as avg_aerials_allowed_per90,
    avg(dribbles_allowed_per90) as avg_dribbles_allowed_per90,
    avg(dispossessed_allowed_per90) as avg_dispossessed_allowed_per90
  from opponent_rates
  group by season, position, opponent_is_home
)
select
  r.season,
  r.opponent,
  r.position,
  r.opponent_is_home,
  r.sample_matches,
  r.total_minutes,
  r.ghost_pts_allowed_per90,
  r.goals_allowed_per90,
  r.assists_allowed_per90,
  r.clean_sheets_allowed_per90,
  r.saves_allowed_per90,
  r.goals_against_allowed_per90,
  r.goals_against_outfield_allowed_per90,
  r.key_passes_allowed_per90,
  r.shots_on_target_allowed_per90,
  r.tackles_won_allowed_per90,
  r.interceptions_allowed_per90,
  r.clearances_allowed_per90,
  r.accurate_crosses_allowed_per90,
  r.blocked_shots_allowed_per90,
  r.aerials_allowed_per90,
  r.dribbles_allowed_per90,
  r.dispossessed_allowed_per90,
  round(r.ghost_pts_allowed_per90 / nullif(b.avg_ghost_pts_allowed_per90, 0), 4) as ghost_pts_multiplier,
  round(r.goals_allowed_per90 / nullif(b.avg_goals_allowed_per90, 0), 4) as goals_multiplier,
  round(r.assists_allowed_per90 / nullif(b.avg_assists_allowed_per90, 0), 4) as assists_multiplier,
  round(r.clean_sheets_allowed_per90 / nullif(b.avg_clean_sheets_allowed_per90, 0), 4) as clean_sheets_multiplier,
  round(r.saves_allowed_per90 / nullif(b.avg_saves_allowed_per90, 0), 4) as saves_multiplier,
  round(r.goals_against_allowed_per90 / nullif(b.avg_goals_against_allowed_per90, 0), 4) as goals_against_multiplier,
  round(r.goals_against_outfield_allowed_per90 / nullif(b.avg_goals_against_outfield_allowed_per90, 0), 4) as goals_against_outfield_multiplier,
  round(r.key_passes_allowed_per90 / nullif(b.avg_key_passes_allowed_per90, 0), 4) as key_passes_multiplier,
  round(r.shots_on_target_allowed_per90 / nullif(b.avg_shots_on_target_allowed_per90, 0), 4) as shots_on_target_multiplier,
  round(r.tackles_won_allowed_per90 / nullif(b.avg_tackles_won_allowed_per90, 0), 4) as tackles_won_multiplier,
  round(r.interceptions_allowed_per90 / nullif(b.avg_interceptions_allowed_per90, 0), 4) as interceptions_multiplier,
  round(r.clearances_allowed_per90 / nullif(b.avg_clearances_allowed_per90, 0), 4) as clearances_multiplier,
  round(r.accurate_crosses_allowed_per90 / nullif(b.avg_accurate_crosses_allowed_per90, 0), 4) as accurate_crosses_multiplier,
  round(r.blocked_shots_allowed_per90 / nullif(b.avg_blocked_shots_allowed_per90, 0), 4) as blocked_shots_multiplier,
  round(r.aerials_allowed_per90 / nullif(b.avg_aerials_allowed_per90, 0), 4) as aerials_multiplier,
  round(r.dribbles_allowed_per90 / nullif(b.avg_dribbles_allowed_per90, 0), 4) as dribbles_multiplier,
  round(r.dispossessed_allowed_per90 / nullif(b.avg_dispossessed_allowed_per90, 0), 4) as dispossessed_multiplier
from opponent_rates r
left join position_venue_baseline b
  on b.season = r.season
  and b.position = r.position
  and b.opponent_is_home = r.opponent_is_home;

create or replace view player_prediction_team_context as
with player_fixture_history as (
  select
    pg.player_id,
    pg.season,
    pg.gameweek,
    p.team as player_team,
    p.position,
    case
      when f.home_team = p.team then p.team
      when f.away_team = p.team then p.team
      else null
    end as team_abbrev,
    case
      when f.home_team = p.team then true
      when f.away_team = p.team then false
      else null
    end as team_is_home,
    case
      when f.home_team = p.team then f.away_team
      when f.away_team = p.team then f.home_team
      else null
    end as opponent,
    pg.minutes_played::numeric as minutes_played,
    pg.clean_sheet::numeric as clean_sheet,
    pg.goals_against::numeric as goals_against,
    pg.goals_against_outfield::numeric as goals_against_outfield,
    pg.saves::numeric as saves,
    pg.ghost_pts::numeric as ghost_pts,
    pg.goals::numeric as goals,
    pg.assists::numeric as assists,
    pg.shots_on_target::numeric as shots_on_target
  from player_gameweeks pg
  join players p
    on p.id = pg.player_id
  left join lateral (
    select fx.home_team, fx.away_team
    from fixtures fx
    where fx.season = pg.season
      and fx.gameweek = pg.gameweek
      and (fx.home_team = p.team or fx.away_team = p.team)
    order by fx.id
    limit 1
  ) f on true
  where pg.games_played > 0
),
team_match_rows as (
  select
    season,
    team_abbrev,
    team_is_home,
    opponent,
    gameweek,
    max(clean_sheet) as clean_sheet_flag,
    max(goals_against) filter (where position = 'G') as keeper_goals_against,
    max(goals_against_outfield) filter (where position = 'D') as defender_goals_against,
    sum(saves) filter (where position = 'G') as keeper_saves,
    sum(shots_on_target) as shots_on_target_for_team,
    sum(goals) as goals_scored_by_team,
    sum(assists) as assists_by_team,
    avg(ghost_pts) as avg_player_ghost_pts,
    sum(minutes_played) as total_player_minutes
  from player_fixture_history
  where team_abbrev is not null
    and team_is_home is not null
  group by season, team_abbrev, team_is_home, opponent, gameweek
),
team_context_base as (
  select
    season,
    team_abbrev,
    team_is_home,
    count(*) as sample_matches,
    avg(clean_sheet_flag) as clean_sheet_rate,
    avg(coalesce(keeper_goals_against, defender_goals_against, 0)) as avg_goals_against,
    avg(coalesce(keeper_saves, 0)) as avg_saves,
    avg(coalesce(shots_on_target_for_team, 0)) as avg_team_shots_on_target,
    avg(coalesce(goals_scored_by_team, 0)) as avg_team_goals_scored,
    avg(coalesce(assists_by_team, 0)) as avg_team_assists,
    avg(avg_player_ghost_pts) as avg_player_ghost_pts,
    avg(total_player_minutes) as avg_total_player_minutes
  from team_match_rows
  group by season, team_abbrev, team_is_home
),
league_baseline as (
  select
    season,
    team_is_home,
    avg(clean_sheet_rate) as league_clean_sheet_rate,
    avg(avg_goals_against) as league_avg_goals_against,
    avg(avg_saves) as league_avg_saves,
    avg(avg_team_shots_on_target) as league_avg_team_shots_on_target,
    avg(avg_team_goals_scored) as league_avg_team_goals_scored,
    avg(avg_team_assists) as league_avg_team_assists,
    avg(avg_player_ghost_pts) as league_avg_player_ghost_pts
  from team_context_base
  group by season, team_is_home
)
select
  t.season,
  t.team_abbrev,
  t.team_is_home,
  t.sample_matches,
  round(t.clean_sheet_rate::numeric, 4) as clean_sheet_rate,
  round(t.avg_goals_against::numeric, 4) as avg_goals_against,
  round(t.avg_saves::numeric, 4) as avg_saves,
  round(t.avg_team_shots_on_target::numeric, 4) as avg_team_shots_on_target,
  round(t.avg_team_goals_scored::numeric, 4) as avg_team_goals_scored,
  round(t.avg_team_assists::numeric, 4) as avg_team_assists,
  round(t.avg_player_ghost_pts::numeric, 4) as avg_player_ghost_pts,
  round(t.avg_total_player_minutes::numeric, 4) as avg_total_player_minutes,
  round(t.clean_sheet_rate / nullif(l.league_clean_sheet_rate, 0), 4) as clean_sheet_strength,
  round(t.avg_goals_against / nullif(l.league_avg_goals_against, 0), 4) as goals_against_strength,
  round(t.avg_saves / nullif(l.league_avg_saves, 0), 4) as saves_strength,
  round(t.avg_team_shots_on_target / nullif(l.league_avg_team_shots_on_target, 0), 4) as shots_on_target_strength,
  round(t.avg_team_goals_scored / nullif(l.league_avg_team_goals_scored, 0), 4) as goal_scoring_strength,
  round(t.avg_team_assists / nullif(l.league_avg_team_assists, 0), 4) as assist_strength,
  round(t.avg_player_ghost_pts / nullif(l.league_avg_player_ghost_pts, 0), 4) as ghost_pts_strength
from team_context_base t
left join league_baseline l
  on l.season = t.season
  and l.team_is_home = t.team_is_home;

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
    pg.subbed_off::numeric as subbed_off
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
