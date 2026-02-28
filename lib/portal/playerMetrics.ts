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
  attack_pts: number;
};

export type PlayerSeasonSummary = {
  season_total_pts: number;
  avg_pts_per_game: number;
  avg_pts_per_start: number;
  total_ghost_pts: number;
  avg_ghost_per_game: number;
  avg_ghost_per_start: number;
  games_played: number;
  games_started: number;
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
    const fixture = fixtures.find(
      (item) => item.gameweek === row.gameweek && (item.home_team === team || item.away_team === team)
    );
    const isHome = fixture ? fixture.home_team === team : null;
    const opponent = fixture ? (isHome ? fixture.away_team : fixture.home_team) : null;

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
      attack_pts: Number(row.goals ?? 0) + Number(row.assists ?? 0) + Number(row.clean_sheet ?? 0),
    };
  });
}

export function summarizePlayerSeason(rows: DecoratedGameweek[]): PlayerSeasonSummary {
  const playedRows = rows.filter((row) => row.games_played === 1);
  const startedRows = rows.filter((row) => row.games_started === 1);
  const homeRows = playedRows.filter((row) => row.isHome === true);
  const awayRows = playedRows.filter((row) => row.isHome === false);

  const seasonTotalPts = playedRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const totalGhostPts = playedRows.reduce((sum, row) => sum + row.ghost_pts, 0);
  const attackPts = rows.reduce((sum, row) => sum + row.attack_pts, 0);
  const startTotalPts = startedRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const startTotalGhostPts = startedRows.reduce((sum, row) => sum + row.ghost_pts, 0);
  const homeTotalPts = homeRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);
  const awayTotalPts = awayRows.reduce((sum, row) => sum + row.raw_fantrax_pts, 0);

  const gamesPlayed = playedRows.length;
  const gamesStarted = startedRows.length;

  return {
    season_total_pts: seasonTotalPts,
    avg_pts_per_game: gamesPlayed > 0 ? seasonTotalPts / gamesPlayed : 0,
    avg_pts_per_start: gamesStarted > 0 ? startTotalPts / gamesStarted : 0,
    total_ghost_pts: totalGhostPts,
    avg_ghost_per_game: gamesPlayed > 0 ? totalGhostPts / gamesPlayed : 0,
    avg_ghost_per_start: gamesStarted > 0 ? startTotalGhostPts / gamesStarted : 0,
    games_played: gamesPlayed,
    games_started: gamesStarted,
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
