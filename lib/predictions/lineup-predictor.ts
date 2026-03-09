export type PlayerPredictionFeatureRow = {
  season: string;
  gameweek: number;
  player_id: string;
  player_name: string;
  team: string;
  position: "G" | "D" | "M" | "F";
  opponent: string | null;
  is_home: boolean | null;
  expected_start_probability_input: number | null;
  expected_minutes_input: number | null;
  last5_start_rate: number | null;
  last10_start_rate: number | null;
  season_start_rate: number | null;
  last5_avg_minutes_if_start: number | null;
  last10_avg_minutes_if_start: number | null;
  availability_probability: number | null;
  fpl_starts_per_90: number | null;
};

export type LineupPrediction = {
  player_id: string;
  team: string;
  predicted_starter: boolean;
  starter_score: number;
  adjusted_start_probability: number;
  adjusted_expected_minutes: number;
};

type TeamFixtureGroup = {
  team: string;
  fixtureKey: string;
  players: PlayerPredictionFeatureRow[];
};

type Formation = {
  defenders: number;
  midfielders: number;
  forwards: number;
};

const ALLOWED_FORMATIONS: Formation[] = [
  { defenders: 3, midfielders: 4, forwards: 3 },
  { defenders: 3, midfielders: 5, forwards: 2 },
  { defenders: 4, midfielders: 3, forwards: 3 },
  { defenders: 4, midfielders: 4, forwards: 2 },
  { defenders: 4, midfielders: 5, forwards: 1 },
  { defenders: 5, midfielders: 4, forwards: 1 },
  { defenders: 5, midfielders: 3, forwards: 2 },
];

function toFiniteNumber(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildFixtureKey(row: PlayerPredictionFeatureRow): string {
  return [
    row.season,
    String(row.gameweek),
    row.team,
    row.opponent ?? "UNKNOWN",
    row.is_home == null ? "U" : row.is_home ? "H" : "A",
  ].join(":");
}

function groupPlayersByTeamFixture(rows: PlayerPredictionFeatureRow[]): TeamFixtureGroup[] {
  const groups = new Map<string, TeamFixtureGroup>();

  for (const row of rows) {
    const fixtureKey = buildFixtureKey(row);
    const existing = groups.get(fixtureKey);

    if (existing) {
      existing.players.push(row);
      continue;
    }

    groups.set(fixtureKey, {
      team: row.team,
      fixtureKey,
      players: [row],
    });
  }

  return Array.from(groups.values());
}

export function calculateStarterScore(row: PlayerPredictionFeatureRow): number {
  const expectedStartProbabilityInput = clamp(toFiniteNumber(row.expected_start_probability_input), 0, 1);
  const last5StartRate = clamp(toFiniteNumber(row.last5_start_rate), 0, 1);
  const last10StartRate = clamp(toFiniteNumber(row.last10_start_rate), 0, 1);
  const seasonStartRate = clamp(toFiniteNumber(row.season_start_rate), 0, 1);
  const availabilityProbability = clamp(toFiniteNumber(row.availability_probability, 1), 0, 1);

  const starterScore =
    expectedStartProbabilityInput * 0.4 +
    last5StartRate * 0.25 +
    last10StartRate * 0.15 +
    seasonStartRate * 0.1 +
    availabilityProbability * 0.1;

  return roundTo4(starterScore);
}

function comparePlayers(a: PlayerPredictionFeatureRow, b: PlayerPredictionFeatureRow): number {
  const scoreDiff = calculateStarterScore(b) - calculateStarterScore(a);
  if (Math.abs(scoreDiff) > 0.0001) {
    return scoreDiff;
  }

  const aMinutes = toFiniteNumber(a.last5_avg_minutes_if_start) + toFiniteNumber(a.last10_avg_minutes_if_start);
  const bMinutes = toFiniteNumber(b.last5_avg_minutes_if_start) + toFiniteNumber(b.last10_avg_minutes_if_start);
  if (bMinutes !== aMinutes) {
    return bMinutes - aMinutes;
  }

  const aFplStarts = toFiniteNumber(a.fpl_starts_per_90);
  const bFplStarts = toFiniteNumber(b.fpl_starts_per_90);
  if (bFplStarts !== aFplStarts) {
    return bFplStarts - aFplStarts;
  }

  return a.player_name.localeCompare(b.player_name);
}

function sumStarterScores(rows: PlayerPredictionFeatureRow[]): number {
  return rows.reduce((total, row) => total + calculateStarterScore(row), 0);
}

function takeTopPlayers(rows: PlayerPredictionFeatureRow[], count: number): PlayerPredictionFeatureRow[] | null {
  if (rows.length < count) {
    return null;
  }

  return rows.slice(0, count);
}

function selectBestFormation(players: PlayerPredictionFeatureRow[]): Set<string> {
  const goalkeepers = players.filter((player) => player.position === "G").sort(comparePlayers);
  const defenders = players.filter((player) => player.position === "D").sort(comparePlayers);
  const midfielders = players.filter((player) => player.position === "M").sort(comparePlayers);
  const forwards = players.filter((player) => player.position === "F").sort(comparePlayers);

  const lockedGoalkeeper = goalkeepers[0] ?? null;
  if (!lockedGoalkeeper) {
    return new Set(players.sort(comparePlayers).slice(0, 11).map((player) => player.player_id));
  }

  let bestSelection: PlayerPredictionFeatureRow[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const formation of ALLOWED_FORMATIONS) {
    const selectedDefenders = takeTopPlayers(defenders, formation.defenders);
    const selectedMidfielders = takeTopPlayers(midfielders, formation.midfielders);
    const selectedForwards = takeTopPlayers(forwards, formation.forwards);

    if (!selectedDefenders || !selectedMidfielders || !selectedForwards) {
      continue;
    }

    const selection = [
      lockedGoalkeeper,
      ...selectedDefenders,
      ...selectedMidfielders,
      ...selectedForwards,
    ];

    const selectionScore = sumStarterScores(selection);
    if (selectionScore > bestScore) {
      bestScore = selectionScore;
      bestSelection = selection;
    }
  }

  if (bestSelection) {
    return new Set(bestSelection.map((player) => player.player_id));
  }

  const fallbackStarters = [
    lockedGoalkeeper,
    ...players
      .filter((player) => player.player_id !== lockedGoalkeeper.player_id)
      .sort(comparePlayers)
      .slice(0, 10),
  ];

  return new Set(fallbackStarters.map((player) => player.player_id));
}

export function predictLineups(rows: PlayerPredictionFeatureRow[]): LineupPrediction[] {
  const predictions: LineupPrediction[] = [];

  for (const group of groupPlayersByTeamFixture(rows)) {
    const starterIds = selectBestFormation(group.players);

    for (const row of [...group.players].sort(comparePlayers)) {
      const predictedStarter = starterIds.has(row.player_id);
      const originalStartProbability = clamp(toFiniteNumber(row.expected_start_probability_input), 0, 1);
      const originalExpectedMinutes = clamp(toFiniteNumber(row.expected_minutes_input), 0, 90);

      predictions.push({
        player_id: row.player_id,
        team: row.team,
        predicted_starter: predictedStarter,
        starter_score: calculateStarterScore(row),
        adjusted_start_probability: roundTo4(
          predictedStarter
            ? Math.max(originalStartProbability, 0.7)
            : Math.min(originalStartProbability, 0.3)
        ),
        adjusted_expected_minutes: roundTo2(
          predictedStarter
            ? Math.max(originalExpectedMinutes, 65)
            : Math.min(originalExpectedMinutes, 30)
        ),
      });
    }
  }

  return predictions;
}
