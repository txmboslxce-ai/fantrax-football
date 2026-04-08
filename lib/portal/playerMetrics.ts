export const SEASON = "2025-26";

export type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: string;
};

export type TeamRow = {
  abbrev: string;
  name: string | null;
  full_name: string | null;
};

export type FixtureRow = {
  id: string;
  season: string;
  gameweek: number;
  home_team: string;
  away_team: string;
};

export type PlayerGameweekRow = {
  id: string;
  player_id: string;
  season: string;
  gameweek: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
  goals: number;
  assists: number;
  clean_sheet: number;
  goals_against: number;
  saves: number;
  key_passes: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  aerials_won: number;
};

export type DecoratedGameweek = {
  id: string;
  gameweek: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  raw_fantrax_pts: number;
  ghost_pts: number;
  goals: number;
  assists: number;
  clean_sheet: number;
  goals_against: number;
  saves: number;
  key_passes: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  aerials_won: number;
  isHome: boolean | null;
  opponent: string | null;
  isHomeAll: boolean[];
  opponents: string[];
  attack_pts: number;
};

export type PlayerSeasonSummary = {
  season_total_pts: number;
  gameweeks_played: number;
  total_games_played: number;
  total_games_started: number;
  avg_pts_per_gameweek: number;
  avg_pts_per_game: number;
  avg_pts_per_start: number;
  total_ghost_pts: number;
  avg_ghost_per_gameweek: number;
  avg_ghost_per_game: number;
  avg_ghost_per_start: number;
  home_avg: number;
  away_avg: number;
  home_pct: number;
  away_pct: number;
  attack_pts: number;
  ghost_pts_total: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  saves: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  aerials: number;
  key_passes: number;
  current_gameweek: number;
};

export type PlayerTableWindowKey = "last5" | "last10" | "season";

export type PlayerWindowStats = {
  fantasy_pts_per_start: number;
  ghost_pts_per_start: number;
  games_started: number;
  minutes_per_start: number;
  floor_per_start: number;
  ceiling_per_start: number;
  season_pts: number;
  avg_pts_per_gw: number;
  ghost_pts_per_gw: number;
  ghost_pts_pct: number;
  goals_pts_pct: number;
  assist_pts_pct: number;
  clean_sheet_pts_pct: number;
  attacking_pts_pct: number;
  defensive_pts_pct: number;
  total_attacking_defensive_pct: number;
  games_played: number;
  total_minutes: number;
  std_deviation: number;
  median_pts_per_start: number;
  coefficient_of_variation: number;
  home_pts_per_start: number;
  home_pts_pct: number;
  away_pts_per_start: number;
  away_pts_pct: number;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function goalPoints(position: string, goals: number): number {
  if (position === "DEF" || position === "GK") {
    return goals * 10;
  }

  if (position === "MID" || position === "FWD") {
    return goals * 9;
  }

  return 0;
}

function assistPoints(position: string, assists: number): number {
  if (position === "DEF" || position === "GK") {
    return assists * 7;
  }

  if (position === "MID" || position === "FWD") {
    return assists * 6;
  }

  return 0;
}

function cleanSheetPoints(position: string, cleanSheet: number): number {
  if (position === "DEF" || position === "GK") {
    return cleanSheet * 6;
  }

  if (position === "MID") {
    return cleanSheet;
  }

  return 0;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function mapPosition(position: string): "GK" | "DEF" | "MID" | "FWD" {
  switch (position) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "M":
      return "MID";
    case "F":
      return "FWD";
    default:
      return "MID";
  }
}

export function teamNameMap(teams: TeamRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const team of teams) {
    map.set(team.abbrev, team.full_name || team.name || team.abbrev);
  }
  return map;
}

export function decorateGameweeks(rows: PlayerGameweekRow[], team: string, fixtures: FixtureRow[]): DecoratedGameweek[] {
  return rows.map((row) => {
    const fixturesInGameweek = fixtures.filter(
      (item) => item.gameweek === row.gameweek && (item.home_team === team || item.away_team === team)
    );
    const relevantFixtures = Number(row.games_played ?? 0) === 2 ? fixturesInGameweek : fixturesInGameweek.slice(0, 1);
    const fixture = relevantFixtures[0];
    const isHome = fixture ? fixture.home_team === team : null;
    const opponent = fixture ? (isHome ? fixture.away_team : fixture.home_team) : null;
    const isHomeAll = relevantFixtures.map((item) => item.home_team === team);
    const opponents = relevantFixtures.map((item) => (item.home_team === team ? item.away_team : item.home_team));

    return {
      id: row.id,
      gameweek: row.gameweek,
      games_played: Number(row.games_played ?? 0),
      games_started: Number(row.games_started ?? 0),
      minutes_played: Number(row.minutes_played ?? 0),
      raw_fantrax_pts: toNumber(row.raw_fantrax_pts),
      ghost_pts: toNumber(row.ghost_pts),
      goals: Number(row.goals ?? 0),
      assists: Number(row.assists ?? 0),
      clean_sheet: Number(row.clean_sheet ?? 0),
      goals_against: Number(row.goals_against ?? 0),
      saves: Number(row.saves ?? 0),
      key_passes: Number(row.key_passes ?? 0),
      tackles_won: Number(row.tackles_won ?? 0),
      interceptions: Number(row.interceptions ?? 0),
      clearances: Number(row.clearances ?? 0),
      aerials_won: Number(row.aerials_won ?? 0),
      isHome,
      opponent,
      isHomeAll,
      opponents,
      attack_pts: toNumber(row.raw_fantrax_pts) - toNumber(row.ghost_pts),
    };
  });
}

export function summarizePlayerSeason(rows: DecoratedGameweek[]): PlayerSeasonSummary {
  const playedRows = rows.filter((row) => row.games_played > 0);
  const homeRows = playedRows.filter((row) => row.isHome === true);
  const awayRows = playedRows.filter((row) => row.isHome === false);

  const seasonTotalPts = playedRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const totalGhostPts = playedRows.reduce((sum, row) => sum + row.ghost_pts, 0);
  const attackPts = rows.reduce((sum, row) => sum + row.attack_pts, 0);
  const homeTotalPts = homeRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const awayTotalPts = awayRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);

  const gameweeksPlayed = playedRows.length;
  const totalGamesPlayed = playedRows.reduce((sum, row) => sum + row.games_played, 0);
  const totalGamesStarted = playedRows.reduce((sum, row) => sum + row.games_started, 0);

  return {
    season_total_pts: seasonTotalPts,
    gameweeks_played: gameweeksPlayed,
    total_games_played: totalGamesPlayed,
    total_games_started: totalGamesStarted,
    avg_pts_per_gameweek: gameweeksPlayed > 0 ? seasonTotalPts / gameweeksPlayed : 0,
    avg_pts_per_game: totalGamesPlayed > 0 ? seasonTotalPts / totalGamesPlayed : 0,
    avg_pts_per_start: totalGamesStarted > 0 ? seasonTotalPts / totalGamesStarted : 0,
    total_ghost_pts: totalGhostPts,
    avg_ghost_per_gameweek: gameweeksPlayed > 0 ? totalGhostPts / gameweeksPlayed : 0,
    avg_ghost_per_game: totalGamesPlayed > 0 ? totalGhostPts / totalGamesPlayed : 0,
    avg_ghost_per_start: totalGamesStarted > 0 ? totalGhostPts / totalGamesStarted : 0,
    home_avg: homeRows.length > 0 ? homeTotalPts / homeRows.length : 0,
    away_avg: awayRows.length > 0 ? awayTotalPts / awayRows.length : 0,
    home_pct: seasonTotalPts > 0 ? (homeTotalPts / seasonTotalPts) * 100 : 0,
    away_pct: seasonTotalPts > 0 ? (awayTotalPts / seasonTotalPts) * 100 : 0,
    attack_pts: attackPts,
    ghost_pts_total: totalGhostPts,
    goals: playedRows.reduce((sum, row) => sum + row.goals, 0),
    assists: playedRows.reduce((sum, row) => sum + row.assists, 0),
    clean_sheets: playedRows.reduce((sum, row) => sum + row.clean_sheet, 0),
    saves: playedRows.reduce((sum, row) => sum + row.saves, 0),
    tackles: playedRows.reduce((sum, row) => sum + row.tackles_won, 0),
    interceptions: playedRows.reduce((sum, row) => sum + row.interceptions, 0),
    clearances: playedRows.reduce((sum, row) => sum + row.clearances, 0),
    aerials: playedRows.reduce((sum, row) => sum + row.aerials_won, 0),
    key_passes: playedRows.reduce((sum, row) => sum + row.key_passes, 0),
    current_gameweek: rows.reduce((max, row) => Math.max(max, row.gameweek), 0),
  };
}

export function summarizePlayerWindow(rows: DecoratedGameweek[], position: "GK" | "DEF" | "MID" | "FWD"): PlayerWindowStats {
  const playedRows = rows.filter((row) => row.games_played > 0);
  const startedRows = rows.filter((row) => row.games_started === 1);
  const homeStartedRows = startedRows.filter((row) => row.isHome === true);
  const awayStartedRows = startedRows.filter((row) => row.isHome === false);

  const seasonPts = playedRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const totalGhostPts = playedRows.reduce((sum, row) => sum + row.ghost_pts, 0);
  const totalGoalPts = playedRows.reduce((sum, row) => sum + goalPoints(position, row.goals), 0);
  const totalAssistPts = playedRows.reduce((sum, row) => sum + assistPoints(position, row.assists), 0);
  const totalCleanSheetPts = playedRows.reduce((sum, row) => sum + cleanSheetPoints(position, row.clean_sheet), 0);
  const totalAttackingPts = totalGoalPts + totalAssistPts;
  const totalDefensivePts = totalCleanSheetPts + totalGhostPts;
  const startedPoints = startedRows.map((row) => row.raw_fantrax_pts);
  const startedTotalPts = startedPoints.reduce((sum, value) => sum + value, 0);
  const homeStartedTotalPts = homeStartedRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const awayStartedTotalPts = awayStartedRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const pointsStdDeviation = standardDeviation(startedPoints);
  const pointsMean = average(startedPoints);

  return {
    fantasy_pts_per_start: roundTo2(pointsMean),
    ghost_pts_per_start: roundTo2(average(startedRows.map((row) => row.ghost_pts))),
    games_started: startedRows.length,
    minutes_per_start: roundTo2(average(startedRows.map((row) => row.minutes_played))),
    floor_per_start: roundTo2(startedRows.length > 0 ? Math.min(...startedPoints) : 0),
    ceiling_per_start: roundTo2(startedRows.length > 0 ? Math.max(...startedPoints) : 0),
    season_pts: roundTo2(seasonPts),
    avg_pts_per_gw: roundTo2(average(playedRows.map((row) => row.raw_fantrax_pts))),
    ghost_pts_per_gw: roundTo2(average(playedRows.map((row) => row.ghost_pts))),
    ghost_pts_pct: roundTo2(seasonPts !== 0 ? (totalGhostPts / seasonPts) * 100 : 0),
    goals_pts_pct: roundTo2(seasonPts !== 0 ? (totalGoalPts / seasonPts) * 100 : 0),
    assist_pts_pct: roundTo2(seasonPts !== 0 ? (totalAssistPts / seasonPts) * 100 : 0),
    clean_sheet_pts_pct: roundTo2(seasonPts !== 0 ? (totalCleanSheetPts / seasonPts) * 100 : 0),
    attacking_pts_pct: roundTo2(seasonPts !== 0 ? (totalAttackingPts / seasonPts) * 100 : 0),
    defensive_pts_pct: roundTo2(seasonPts !== 0 ? (totalDefensivePts / seasonPts) * 100 : 0),
    total_attacking_defensive_pct: roundTo2(seasonPts !== 0 ? ((totalAttackingPts + totalDefensivePts) / seasonPts) * 100 : 0),
    games_played: playedRows.reduce((sum, row) => sum + row.games_played, 0),
    total_minutes: playedRows.reduce((sum, row) => sum + row.minutes_played, 0),
    std_deviation: roundTo2(pointsStdDeviation),
    median_pts_per_start: roundTo2(median(startedPoints)),
    coefficient_of_variation: roundTo2(pointsMean !== 0 ? pointsStdDeviation / pointsMean : 0),
    home_pts_per_start: roundTo2(average(homeStartedRows.map((row) => row.raw_fantrax_pts))),
    home_pts_pct: roundTo2(startedTotalPts !== 0 ? (homeStartedTotalPts / startedTotalPts) * 100 : 0),
    away_pts_per_start: roundTo2(average(awayStartedRows.map((row) => row.raw_fantrax_pts))),
    away_pts_pct: roundTo2(startedTotalPts !== 0 ? (awayStartedTotalPts / startedTotalPts) * 100 : 0),
  };
}

export function nextFixtures(team: string, fixtures: FixtureRow[], currentGw: number, teamNames: Map<string, string>, limit = 5) {
  return fixtures
    .filter((fixture) => fixture.gameweek > currentGw && (fixture.home_team === team || fixture.away_team === team))
    .sort((a, b) => a.gameweek - b.gameweek)
    .slice(0, limit)
    .map((fixture) => {
      const isHome = fixture.home_team === team;
      const opponentCode = isHome ? fixture.away_team : fixture.home_team;
      return {
        id: fixture.id,
        gameweek: fixture.gameweek,
        isHome,
        opponentCode,
        opponentName: teamNames.get(opponentCode) ?? opponentCode,
      };
    });
}

export function formatFixed(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}
