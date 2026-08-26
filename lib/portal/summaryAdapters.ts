// Thin adapters from the stored `player_window_stats` row shape (see
// supabase/migrations/033_create_player_summary_tables.sql) to the exact
// shapes each page already expects (PlayerWindowStats, PlayerSeasonSummary,
// and the Stats page's own StatsWindowRow). Keeping this mapping in one
// place means every page's displayed numbers keep coming from the same
// column, however many pages read it.
import type { PlayerSeasonSummary, PlayerWindowStats } from "@/lib/portal/playerMetrics";

export type PlayerWindowStatsRow = {
  player_id: string;
  season: string;
  window: "season" | "last5" | "last10";
  gameweeks_played: number;
  games_played: number;
  games_started: number;
  games_started_total: number;
  total_minutes: number;
  current_gameweek: number;
  season_pts: number;
  avg_pts_per_gameweek: number;
  avg_pts_per_game: number;
  avg_pts_per_start: number;
  season_avg_pts_per_start: number;
  total_ghost_pts: number;
  avg_ghost_per_gameweek: number;
  avg_ghost_per_game: number;
  avg_ghost_per_start: number;
  season_avg_ghost_per_start: number;
  attack_pts: number;
  minutes_per_start: number;
  floor_per_start: number;
  ceiling_per_start: number;
  tenth_percentile_per_start: number;
  ninetieth_percentile_per_start: number;
  std_deviation: number;
  median_pts_per_start: number;
  coefficient_of_variation: number;
  home_avg: number;
  away_avg: number;
  home_pct: number;
  away_pct: number;
  home_pts_per_start: number;
  home_pts_pct: number;
  away_pts_per_start: number;
  away_pts_pct: number;
  ghost_pts_pct: number;
  goals_pts_pct: number;
  assist_pts_pct: number;
  clean_sheet_pts_pct: number;
  attacking_pts_pct: number;
  defensive_pts_pct: number;
  total_attacking_defensive_pct: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  key_passes: number;
  shots_on_target: number;
  dribbles_succeeded: number;
  dispossessed: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  blocked_shots: number;
  aerials_won: number;
  accurate_crosses: number;
  goals_against_outfield: number;
  saves: number;
  penalty_saves: number;
  goals_against: number;
  high_claims: number;
  smothers: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_missed: number;
  penalties_drawn: number;
  corner_kicks: number;
  free_kick_shots: number;
};

// A player who is in this season's pool but hasn't been through a
// recompute pass yet (e.g. just added mid-sync) falls back to this rather
// than a missing row breaking the page — every count/average is simply 0
// until the next recompute fills it in.
export function emptyWindowStatsRow(
  playerId: string,
  season: string,
  window: PlayerWindowStatsRow["window"]
): PlayerWindowStatsRow {
  return {
    player_id: playerId,
    season,
    window,
    gameweeks_played: 0,
    games_played: 0,
    games_started: 0,
    games_started_total: 0,
    total_minutes: 0,
    current_gameweek: 0,
    season_pts: 0,
    avg_pts_per_gameweek: 0,
    avg_pts_per_game: 0,
    avg_pts_per_start: 0,
    season_avg_pts_per_start: 0,
    total_ghost_pts: 0,
    avg_ghost_per_gameweek: 0,
    avg_ghost_per_game: 0,
    avg_ghost_per_start: 0,
    season_avg_ghost_per_start: 0,
    attack_pts: 0,
    minutes_per_start: 0,
    floor_per_start: 0,
    ceiling_per_start: 0,
    tenth_percentile_per_start: 0,
    ninetieth_percentile_per_start: 0,
    std_deviation: 0,
    median_pts_per_start: 0,
    coefficient_of_variation: 0,
    home_avg: 0,
    away_avg: 0,
    home_pct: 0,
    away_pct: 0,
    home_pts_per_start: 0,
    home_pts_pct: 0,
    away_pts_per_start: 0,
    away_pts_pct: 0,
    ghost_pts_pct: 0,
    goals_pts_pct: 0,
    assist_pts_pct: 0,
    clean_sheet_pts_pct: 0,
    attacking_pts_pct: 0,
    defensive_pts_pct: 0,
    total_attacking_defensive_pct: 0,
    goals: 0,
    assists: 0,
    clean_sheets: 0,
    key_passes: 0,
    shots_on_target: 0,
    dribbles_succeeded: 0,
    dispossessed: 0,
    tackles_won: 0,
    interceptions: 0,
    clearances: 0,
    blocked_shots: 0,
    aerials_won: 0,
    accurate_crosses: 0,
    goals_against_outfield: 0,
    saves: 0,
    penalty_saves: 0,
    goals_against: 0,
    high_claims: 0,
    smothers: 0,
    yellow_cards: 0,
    red_cards: 0,
    own_goals: 0,
    penalties_missed: 0,
    penalties_drawn: 0,
    corner_kicks: 0,
    free_kick_shots: 0,
  };
}

export const PLAYER_WINDOW_STATS_COLUMNS =
  "player_id, season, window, gameweeks_played, games_played, games_started, games_started_total, total_minutes, current_gameweek, season_pts, avg_pts_per_gameweek, avg_pts_per_game, avg_pts_per_start, season_avg_pts_per_start, total_ghost_pts, avg_ghost_per_gameweek, avg_ghost_per_game, avg_ghost_per_start, season_avg_ghost_per_start, attack_pts, minutes_per_start, floor_per_start, ceiling_per_start, tenth_percentile_per_start, ninetieth_percentile_per_start, std_deviation, median_pts_per_start, coefficient_of_variation, home_avg, away_avg, home_pct, away_pct, home_pts_per_start, home_pts_pct, away_pts_per_start, away_pts_pct, ghost_pts_pct, goals_pts_pct, assist_pts_pct, clean_sheet_pts_pct, attacking_pts_pct, defensive_pts_pct, total_attacking_defensive_pct, goals, assists, clean_sheets, key_passes, shots_on_target, dribbles_succeeded, dispossessed, tackles_won, interceptions, clearances, blocked_shots, aerials_won, accurate_crosses, goals_against_outfield, saves, penalty_saves, goals_against, high_claims, smothers, yellow_cards, red_cards, own_goals, penalties_missed, penalties_drawn, corner_kicks, free_kick_shots";

export function toPlayerWindowStats(row: PlayerWindowStatsRow): PlayerWindowStats {
  return {
    fantasy_pts_per_start: row.avg_pts_per_start,
    ghost_pts_per_start: row.avg_ghost_per_start,
    games_started: row.games_started,
    minutes_per_start: row.minutes_per_start,
    floor_per_start: row.floor_per_start,
    ceiling_per_start: row.ceiling_per_start,
    tenth_percentile_per_start: row.tenth_percentile_per_start,
    ninetieth_percentile_per_start: row.ninetieth_percentile_per_start,
    season_pts: row.season_pts,
    avg_pts_per_gw: row.avg_pts_per_gameweek,
    ghost_pts_per_gw: row.avg_ghost_per_gameweek,
    ghost_pts_pct: row.ghost_pts_pct,
    goals_pts_pct: row.goals_pts_pct,
    assist_pts_pct: row.assist_pts_pct,
    clean_sheet_pts_pct: row.clean_sheet_pts_pct,
    attacking_pts_pct: row.attacking_pts_pct,
    defensive_pts_pct: row.defensive_pts_pct,
    total_attacking_defensive_pct: row.total_attacking_defensive_pct,
    games_played: row.games_played,
    total_minutes: row.total_minutes,
    std_deviation: row.std_deviation,
    median_pts_per_start: row.median_pts_per_start,
    coefficient_of_variation: row.coefficient_of_variation,
    home_pts_per_start: row.home_pts_per_start,
    home_pts_pct: row.home_pts_pct,
    away_pts_per_start: row.away_pts_per_start,
    away_pts_pct: row.away_pts_pct,
  };
}

export type StatsWindowRow = {
  season_pts: number;
  avg_pts_per_gw: number;
  ghost_pts_per_gw: number;
  goals: number;
  assists: number;
  key_passes: number;
  shots_on_target: number;
  dribbles_succeeded: number;
  dispossessed: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  blocked_shots: number;
  aerials_won: number;
  accurate_crosses: number;
  goals_against_outfield: number;
  clean_sheets: number;
  saves: number;
  penalty_saves: number;
  goals_against: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_missed: number;
  penalties_drawn: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  corner_kicks: number;
  free_kick_shots: number;
};

export function toStatsWindowRow(row: PlayerWindowStatsRow): StatsWindowRow {
  return {
    season_pts: row.season_pts,
    avg_pts_per_gw: row.avg_pts_per_gameweek,
    ghost_pts_per_gw: row.avg_ghost_per_gameweek,
    goals: row.goals,
    assists: row.assists,
    key_passes: row.key_passes,
    shots_on_target: row.shots_on_target,
    dribbles_succeeded: row.dribbles_succeeded,
    dispossessed: row.dispossessed,
    tackles_won: row.tackles_won,
    interceptions: row.interceptions,
    clearances: row.clearances,
    blocked_shots: row.blocked_shots,
    aerials_won: row.aerials_won,
    accurate_crosses: row.accurate_crosses,
    goals_against_outfield: row.goals_against_outfield,
    clean_sheets: row.clean_sheets,
    saves: row.saves,
    penalty_saves: row.penalty_saves,
    goals_against: row.goals_against,
    yellow_cards: row.yellow_cards,
    red_cards: row.red_cards,
    own_goals: row.own_goals,
    penalties_missed: row.penalties_missed,
    penalties_drawn: row.penalties_drawn,
    games_played: row.games_played,
    games_started: row.games_started_total,
    minutes_played: row.total_minutes,
    corner_kicks: row.corner_kicks,
    free_kick_shots: row.free_kick_shots,
  };
}

export function toPlayerSeasonSummary(row: PlayerWindowStatsRow): PlayerSeasonSummary {
  return {
    season_total_pts: row.season_pts,
    gameweeks_played: row.gameweeks_played,
    total_games_played: row.games_played,
    total_games_started: row.games_started_total,
    avg_pts_per_gameweek: row.avg_pts_per_gameweek,
    avg_pts_per_game: row.avg_pts_per_game,
    avg_pts_per_start: row.season_avg_pts_per_start,
    total_ghost_pts: row.total_ghost_pts,
    avg_ghost_per_gameweek: row.avg_ghost_per_gameweek,
    avg_ghost_per_game: row.avg_ghost_per_game,
    avg_ghost_per_start: row.season_avg_ghost_per_start,
    home_avg: row.home_avg,
    away_avg: row.away_avg,
    home_pct: row.home_pct,
    away_pct: row.away_pct,
    attack_pts: row.attack_pts,
    ghost_pts_total: row.total_ghost_pts,
    goals: row.goals,
    assists: row.assists,
    clean_sheets: row.clean_sheets,
    saves: row.saves,
    tackles: row.tackles_won,
    interceptions: row.interceptions,
    clearances: row.clearances,
    aerials: row.aerials_won,
    key_passes: row.key_passes,
    shots_on_target: row.shots_on_target,
    dribbles_succeeded: row.dribbles_succeeded,
    penalty_saves: row.penalty_saves,
    high_claims: row.high_claims,
    smothers: row.smothers,
    goals_against: row.goals_against,
    current_gameweek: row.current_gameweek,
  };
}
