type FixtureRow = {
  home_team: string;
  away_team: string;
  gameweek: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isDefender(position: string): boolean {
  return position === "D";
}

function isMidfielder(position: string): boolean {
  return position === "M";
}

function isForward(position: string): boolean {
  return position === "F";
}

function isKeeper(position: string): boolean {
  return position === "G";
}

// Goals against penalty (used for both GA and GAO)
export function calcGoalsAgainstPts(goalsAgainst: number): number {
  if (goalsAgainst <= 1) {
    return 0;
  }

  return (goalsAgainst - 1) * -2;
}

// Outfielder points calculation
export function calcOutfielderPts(row: any): number { // eslint-disable-line @typescript-eslint/no-explicit-any
  const position = String(row.position || "").toUpperCase();
  const goals = toNumber(row.goals);
  const assists = toNumber(row.assists);
  const cleanSheet = toNumber(row.clean_sheet);
  const keyPasses = toNumber(row.key_passes);
  const shotsOnTarget = toNumber(row.shots_on_target);
  const tacklesWon = toNumber(row.tackles_won);
  const interceptions = toNumber(row.interceptions);
  const clearances = toNumber(row.clearances);
  const dribblesSucceeded = toNumber(row.dribbles_succeeded);
  const blockedShots = toNumber(row.blocked_shots);
  const accurateCrosses = toNumber(row.accurate_crosses);
  const penaltiesDrawn = toNumber(row.penalties_drawn);
  const aerialsWon = toNumber(row.aerials_won);
  const dispossessed = toNumber(row.dispossessed);
  const yellowCards = toNumber(row.yellow_cards);
  const redCards = toNumber(row.red_cards);
  const penaltiesMissed = toNumber(row.penalties_missed);
  const ownGoals = toNumber(row.own_goals);
  const goalsAgainstOutfield = toNumber(row.goals_against_outfield);

  const goalPts = goals * (isDefender(position) ? 10 : 9);
  const assistPts = assists * (isDefender(position) ? 7 : 6);
  const cleanSheetPts = cleanSheet * (isDefender(position) ? 6 : isMidfielder(position) ? 1 : 0);
  const aerialPts = aerialsWon * (isDefender(position) ? 1 : 0.5);
  const gaoPts = isDefender(position) ? calcGoalsAgainstPts(goalsAgainstOutfield) : 0;

  const total =
    goalPts +
    assistPts +
    cleanSheetPts +
    keyPasses * 2 +
    shotsOnTarget * 2 +
    tacklesWon +
    interceptions +
    clearances * 0.25 +
    dribblesSucceeded +
    blockedShots +
    accurateCrosses +
    penaltiesDrawn * 2 +
    aerialPts +
    dispossessed * -0.5 +
    yellowCards * -2 +
    redCards * -7 +
    penaltiesMissed * -4 +
    ownGoals * -5 +
    gaoPts;

  return roundTo2(total);
}

// Goalkeeper points calculation
export function calcKeeperPts(row: any): number { // eslint-disable-line @typescript-eslint/no-explicit-any
  const cleanSheet = toNumber(row.clean_sheet);
  const goalsAgainst = toNumber(row.goals_against);
  const saves = toNumber(row.saves);
  const penaltySaves = toNumber(row.penalty_saves);
  const highClaims = toNumber(row.high_claims);
  const smothers = toNumber(row.smothers);
  const goals = toNumber(row.goals);
  const assists = toNumber(row.assists);
  const keyPasses = toNumber(row.key_passes);
  const shotsOnTarget = toNumber(row.shots_on_target);
  const tacklesWon = toNumber(row.tackles_won);
  const interceptions = toNumber(row.interceptions);
  const clearances = toNumber(row.clearances);
  const dribblesSucceeded = toNumber(row.dribbles_succeeded);
  const aerialsWon = toNumber(row.aerials_won);
  const dispossessed = toNumber(row.dispossessed);
  const yellowCards = toNumber(row.yellow_cards);
  const redCards = toNumber(row.red_cards);
  const ownGoals = toNumber(row.own_goals);

  const total =
    cleanSheet * 6 +
    saves * 2 +
    penaltySaves * 8 +
    highClaims +
    smothers +
    goals * 10 +
    assists * 7 +
    keyPasses * 2 +
    shotsOnTarget * 2 +
    tacklesWon +
    interceptions +
    clearances * 0.25 +
    dribblesSucceeded +
    aerialsWon +
    dispossessed * -0.5 +
    yellowCards * -2 +
    redCards * -7 +
    ownGoals * -5 +
    calcGoalsAgainstPts(goalsAgainst);

  return roundTo2(total);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcGoalPts(row: any): number {
  const position = String(row.position || "").toUpperCase();
  const goals = toNumber(row.goals);
  const goalWeight = isDefender(position) || isKeeper(position) ? 10 : 9;
  return goals * goalWeight;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcAssistPts(row: any): number {
  const position = String(row.position || "").toUpperCase();
  const assists = toNumber(row.assists);
  const assistWeight = isDefender(position) || isKeeper(position) ? 7 : 6;
  return assists * assistWeight;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcCleanSheetPts(row: any): number {
  const position = String(row.position || "").toUpperCase();
  const cleanSheet = toNumber(row.clean_sheet);

  if (isDefender(position) || isKeeper(position)) {
    return cleanSheet * 6;
  }

  if (isMidfielder(position)) {
    return cleanSheet;
  }

  if (isForward(position)) {
    return 0;
  }

  return 0;
}

// Ghost points calculation
export function calcGhostPts(row: any): number { // eslint-disable-line @typescript-eslint/no-explicit-any
  const gamesPlayed = toNumber(row.games_played);
  if (gamesPlayed <= 0) {
    return 0;
  }

  const rawPts = toNumber(row.raw_fantrax_pts);
  const result = rawPts - (calcGoalPts(row) + calcAssistPts(row) + calcCleanSheetPts(row));
  return roundTo2(Math.max(0, result));
}

// Parse opponent and home/away from fixtures table
// NOT from the CSV - the CSV opponent column is ignored
export function resolveOpponentFromFixtures(
  fixtures: FixtureRow[],
  team: string,
  gameweek: number,
  homeAway: string
): { opponent: string | null; is_home: boolean | null } {
  const normalizedTeam = team.trim().toUpperCase();
  const normalizedHa = homeAway.trim().toUpperCase();

  const fixture = fixtures.find((item) => {
    if (Number(item.gameweek) !== Number(gameweek)) {
      return false;
    }

    if (normalizedHa === "H") {
      return item.home_team?.toUpperCase() === normalizedTeam;
    }

    if (normalizedHa === "A") {
      return item.away_team?.toUpperCase() === normalizedTeam;
    }

    return (
      item.home_team?.toUpperCase() === normalizedTeam ||
      item.away_team?.toUpperCase() === normalizedTeam
    );
  });

  if (!fixture) {
    return { opponent: null, is_home: null };
  }

  if (normalizedHa === "H") {
    return { opponent: fixture.away_team, is_home: true };
  }

  if (normalizedHa === "A") {
    return { opponent: fixture.home_team, is_home: false };
  }

  const isHome = fixture.home_team?.toUpperCase() === normalizedTeam;
  return {
    opponent: isHome ? fixture.away_team : fixture.home_team,
    is_home: isHome,
  };
}

export function coerceNumber(value: unknown): number {
  return toNumber(value);
}
