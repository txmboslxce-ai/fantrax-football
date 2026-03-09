import type { PlayerPredictionFeatureRow, PredictionPosition } from "@/lib/predictions/types";

const RATE_WEIGHTS = {
  last5: 0.5,
  last10: 0.3,
  season: 0.2,
} as const;

export const FANTRAX_SCORING = {
  keyPasses: 2,
  shotsOnTarget: 2,
  tacklesWon: 1,
  interceptions: 1,
  clearances: 0.25,
  accurateCrosses: 1,
  blockedShots: 1,
  dribblesSucceeded: 1,
  dispossessed: -0.5,
  goalPoints: {
    G: 10,
    D: 10,
    M: 9,
    F: 9,
  },
  assistPoints: {
    G: 7,
    D: 7,
    M: 6,
    F: 6,
  },
  cleanSheetPoints: {
    G: 6,
    D: 6,
    M: 1,
    F: 0,
  },
  savePoints: 2,
  goalsAgainstPenalty: -2,
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundTo4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toFiniteNumber(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

export function weightedRate(last5: number | null, last10: number | null, season: number | null): number {
  const candidates = [
    { value: last5, weight: RATE_WEIGHTS.last5 },
    { value: last10, weight: RATE_WEIGHTS.last10 },
    { value: season, weight: RATE_WEIGHTS.season },
  ];

  let weightedTotal = 0;
  let totalWeight = 0;

  for (const candidate of candidates) {
    if (candidate.value == null || !Number.isFinite(candidate.value)) {
      continue;
    }

    weightedTotal += candidate.value * candidate.weight;
    totalWeight += candidate.weight;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return weightedTotal / totalWeight;
}

export function applyOpponentMultiplier(ratePer90: number, multiplier: number | null): number {
  return ratePer90 * clamp(toFiniteNumber(multiplier, 1), 0.5, 1.5);
}

export function scalePer90ToExpectedMinutes(ratePer90: number, expectedMinutes: number): number {
  return ratePer90 * (clamp(expectedMinutes, 0, 90) / 90);
}

export function aerialPointsPerEvent(position: PredictionPosition): number {
  return position === "D" || position === "G" ? 1 : 0.5;
}

export function goalPointsByPosition(position: PredictionPosition): number {
  return FANTRAX_SCORING.goalPoints[position];
}

export function assistPointsByPosition(position: PredictionPosition): number {
  return FANTRAX_SCORING.assistPoints[position];
}

export function cleanSheetPointsByPosition(position: PredictionPosition): number {
  return FANTRAX_SCORING.cleanSheetPoints[position];
}

export function poissonProbability(lambda: number, k: number): number {
  if (lambda <= 0) {
    return k === 0 ? 1 : 0;
  }

  let factorial = 1;
  for (let i = 2; i <= k; i += 1) {
    factorial *= i;
  }

  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial;
}

export function expectedGoalsAgainstExcess(lambda: number): number {
  const safeLambda = clamp(lambda, 0, 5);
  let expectedExcess = 0;

  for (let goalsAgainst = 2; goalsAgainst <= 10; goalsAgainst += 1) {
    expectedExcess += (goalsAgainst - 1) * poissonProbability(safeLambda, goalsAgainst);
  }

  return expectedExcess;
}

export function blendedGoalRate(row: PlayerPredictionFeatureRow): number {
  const historicalRate = weightedRate(row.last5_goals_per90, row.last10_goals_per90, row.season_goals_per90);
  const fplRate = toFiniteNumber(row.fpl_expected_goals_per_90, historicalRate);
  return fplRate > 0 ? fplRate * 0.55 + historicalRate * 0.45 : historicalRate;
}

export function blendedAssistRate(row: PlayerPredictionFeatureRow): number {
  const historicalRate = weightedRate(row.last5_assists_per90, row.last10_assists_per90, row.season_assists_per90);
  const fplRate = toFiniteNumber(row.fpl_expected_assists_per_90, historicalRate);
  return fplRate > 0 ? fplRate * 0.55 + historicalRate * 0.45 : historicalRate;
}

export function blendedSaveRate(row: PlayerPredictionFeatureRow): number {
  const historicalRate = weightedRate(row.last5_saves_per90, row.last10_saves_per90, row.season_saves_per90);
  const fplRate = toFiniteNumber(row.fpl_saves_per_90, historicalRate);
  const teamRate = toFiniteNumber(row.team_avg_saves, historicalRate);
  return fplRate * 0.45 + historicalRate * 0.35 + teamRate * 0.2;
}

export function blendedGoalsAgainstRate(row: PlayerPredictionFeatureRow): number {
  const historicalRate =
    row.position === "D"
      ? weightedRate(
          row.last5_goals_against_outfield_per90,
          row.last10_goals_against_outfield_per90,
          row.season_goals_against_outfield_per90
        )
      : weightedRate(row.last5_goals_against_per90, row.last10_goals_against_per90, row.season_goals_against_per90);

  const fplRate = toFiniteNumber(row.fpl_expected_goals_conceded_per_90, historicalRate);
  const teamRate = toFiniteNumber(row.team_avg_goals_against, historicalRate);
  return fplRate * 0.45 + historicalRate * 0.35 + teamRate * 0.2;
}
