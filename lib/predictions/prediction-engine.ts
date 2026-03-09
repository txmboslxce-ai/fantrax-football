import type { SupabaseClient } from "@supabase/supabase-js";
import { predictLineups } from "@/lib/predictions/lineup-predictor";
import {
  FANTRAX_SCORING,
  aerialPointsPerEvent,
  applyOpponentMultiplier,
  assistPointsByPosition,
  blendedAssistRate,
  blendedGoalRate,
  blendedGoalsAgainstRate,
  blendedSaveRate,
  clamp,
  cleanSheetPointsByPosition,
  expectedGoalsAgainstExcess,
  goalPointsByPosition,
  roundTo2,
  roundTo4,
  scalePer90ToExpectedMinutes,
  toFiniteNumber,
  weightedRate,
} from "@/lib/predictions/scoring";
import type { PlayerPredictionComponents, PlayerPredictionFeatureRow } from "@/lib/predictions/types";

const FEATURE_SELECT = [
  "season",
  "gameweek",
  "player_id",
  "player_name",
  "team",
  "position",
  "opponent",
  "is_home",
  "expected_start_probability_input",
  "expected_minutes_if_start_input",
  "expected_minutes_if_bench_input",
  "expected_minutes_input",
  "availability_probability",
  "last5_start_rate",
  "last10_start_rate",
  "season_start_rate",
  "last5_avg_minutes_if_start",
  "last10_avg_minutes_if_start",
  "season_avg_minutes_if_start",
  "season_avg_minutes_if_bench",
  "season_ghost_pts_per90",
  "last10_ghost_pts_per90",
  "last5_ghost_pts_per90",
  "season_goals_per90",
  "last10_goals_per90",
  "last5_goals_per90",
  "season_assists_per90",
  "last10_assists_per90",
  "last5_assists_per90",
  "season_clean_sheets_per90",
  "last10_clean_sheets_per90",
  "last5_clean_sheets_per90",
  "season_saves_per90",
  "last10_saves_per90",
  "last5_saves_per90",
  "season_goals_against_per90",
  "last10_goals_against_per90",
  "last5_goals_against_per90",
  "season_goals_against_outfield_per90",
  "last10_goals_against_outfield_per90",
  "last5_goals_against_outfield_per90",
  "season_key_passes_per90",
  "last10_key_passes_per90",
  "last5_key_passes_per90",
  "season_shots_on_target_per90",
  "last10_shots_on_target_per90",
  "last5_shots_on_target_per90",
  "season_tackles_won_per90",
  "last10_tackles_won_per90",
  "last5_tackles_won_per90",
  "season_interceptions_per90",
  "last10_interceptions_per90",
  "last5_interceptions_per90",
  "season_clearances_per90",
  "last10_clearances_per90",
  "last5_clearances_per90",
  "season_accurate_crosses_per90",
  "last10_accurate_crosses_per90",
  "last5_accurate_crosses_per90",
  "season_blocked_shots_per90",
  "last10_blocked_shots_per90",
  "last5_blocked_shots_per90",
  "season_aerials_won_per90",
  "last10_aerials_won_per90",
  "last5_aerials_won_per90",
  "season_dribbles_succeeded_per90",
  "last10_dribbles_succeeded_per90",
  "last5_dribbles_succeeded_per90",
  "season_dispossessed_per90",
  "last10_dispossessed_per90",
  "last5_dispossessed_per90",
  "opponent_ghost_pts_multiplier",
  "opponent_goals_multiplier",
  "opponent_assists_multiplier",
  "opponent_clean_sheets_multiplier",
  "opponent_saves_multiplier",
  "opponent_goals_against_multiplier",
  "opponent_goals_against_outfield_multiplier",
  "opponent_key_passes_multiplier",
  "opponent_shots_on_target_multiplier",
  "opponent_tackles_won_multiplier",
  "opponent_interceptions_multiplier",
  "opponent_clearances_multiplier",
  "opponent_accurate_crosses_multiplier",
  "opponent_blocked_shots_multiplier",
  "opponent_aerials_multiplier",
  "opponent_dribbles_multiplier",
  "opponent_dispossessed_multiplier",
  "team_clean_sheet_rate",
  "team_avg_goals_against",
  "team_avg_saves",
  "team_clean_sheet_strength",
  "team_goals_against_strength",
  "team_saves_strength",
  "fpl_starts_per_90",
  "fpl_expected_goals_per_90",
  "fpl_expected_assists_per_90",
  "fpl_clean_sheets_per_90",
  "fpl_expected_goals_conceded_per_90",
  "fpl_saves_per_90",
].join(", ");

type BuildPredictionOptions = {
  useLineupAdjustments?: boolean;
};

type FixtureProjectionContext = {
  fixtureIndex: number;
  totalFixtures: number;
};

type DoubleGameweekAdjustment = {
  adjustedStartProbability: number;
  adjustedExpectedMinutes: number;
};

function projectedGhostPointsPer90(row: PlayerPredictionFeatureRow): number {
  // Peripheral event projection is the primary ghost driver.
  const keyPasses = applyOpponentMultiplier(
    weightedRate(row.last5_key_passes_per90, row.last10_key_passes_per90, row.season_key_passes_per90),
    row.opponent_key_passes_multiplier
  );
  const shotsOnTarget = applyOpponentMultiplier(
    weightedRate(row.last5_shots_on_target_per90, row.last10_shots_on_target_per90, row.season_shots_on_target_per90),
    row.opponent_shots_on_target_multiplier
  );
  const tacklesWon = applyOpponentMultiplier(
    weightedRate(row.last5_tackles_won_per90, row.last10_tackles_won_per90, row.season_tackles_won_per90),
    row.opponent_tackles_won_multiplier
  );
  const interceptions = applyOpponentMultiplier(
    weightedRate(row.last5_interceptions_per90, row.last10_interceptions_per90, row.season_interceptions_per90),
    row.opponent_interceptions_multiplier
  );
  const clearances = applyOpponentMultiplier(
    weightedRate(row.last5_clearances_per90, row.last10_clearances_per90, row.season_clearances_per90),
    row.opponent_clearances_multiplier
  );
  const accurateCrosses = applyOpponentMultiplier(
    weightedRate(
      row.last5_accurate_crosses_per90,
      row.last10_accurate_crosses_per90,
      row.season_accurate_crosses_per90
    ),
    row.opponent_accurate_crosses_multiplier
  );
  const blockedShots = applyOpponentMultiplier(
    weightedRate(row.last5_blocked_shots_per90, row.last10_blocked_shots_per90, row.season_blocked_shots_per90),
    row.opponent_blocked_shots_multiplier
  );
  const aerialsWon = applyOpponentMultiplier(
    weightedRate(row.last5_aerials_won_per90, row.last10_aerials_won_per90, row.season_aerials_won_per90),
    row.opponent_aerials_multiplier
  );
  const dribblesSucceeded = applyOpponentMultiplier(
    weightedRate(
      row.last5_dribbles_succeeded_per90,
      row.last10_dribbles_succeeded_per90,
      row.season_dribbles_succeeded_per90
    ),
    row.opponent_dribbles_multiplier
  );
  const dispossessed = applyOpponentMultiplier(
    weightedRate(row.last5_dispossessed_per90, row.last10_dispossessed_per90, row.season_dispossessed_per90),
    row.opponent_dispossessed_multiplier
  );

  const peripheralGhostPer90 =
    keyPasses * FANTRAX_SCORING.keyPasses +
    shotsOnTarget * FANTRAX_SCORING.shotsOnTarget +
    tacklesWon * FANTRAX_SCORING.tacklesWon +
    interceptions * FANTRAX_SCORING.interceptions +
    clearances * FANTRAX_SCORING.clearances +
    accurateCrosses * FANTRAX_SCORING.accurateCrosses +
    blockedShots * FANTRAX_SCORING.blockedShots +
    aerialsWon * aerialPointsPerEvent(row.position) +
    dribblesSucceeded * FANTRAX_SCORING.dribblesSucceeded +
    dispossessed * FANTRAX_SCORING.dispossessed;

  // Historical ghost scoring is only a light stabilizer.
  const historicalGhostStabilizerPer90 = applyOpponentMultiplier(
    weightedRate(row.last5_ghost_pts_per90, row.last10_ghost_pts_per90, row.season_ghost_pts_per90),
    row.opponent_ghost_pts_multiplier
  );

  const limitedSample =
    toFiniteNumber(row.last5_start_rate) < 0.4 &&
    toFiniteNumber(row.last10_start_rate) < 0.5 &&
    toFiniteNumber(row.season_start_rate) < 0.5;
  const historicalWeight = limitedSample ? 0.2 : 0.1;

  return peripheralGhostPer90 * (1 - historicalWeight) + historicalGhostStabilizerPer90 * historicalWeight;
}

// Clean-sheet projection blends team defensive context, FPL rates, and fixture difficulty.
function projectedCleanSheetRate(row: PlayerPredictionFeatureRow, expectedMinutes: number): number {
  const teamRate = clamp(toFiniteNumber(row.team_clean_sheet_rate), 0, 1);
  const teamStrength = clamp(toFiniteNumber(row.team_clean_sheet_strength, 1), 0.6, 1.4);
  const fplRate = clamp(toFiniteNumber(row.fpl_clean_sheets_per_90, teamRate), 0, 1);
  const opponentMultiplier = clamp(toFiniteNumber(row.opponent_clean_sheets_multiplier, 1), 0.6, 1.4);

  const baseRate = teamRate * 0.45 + fplRate * 0.35 + clamp(teamRate * teamStrength, 0, 1) * 0.2;
  return clamp(baseRate * opponentMultiplier * (expectedMinutes / 90), 0, 1);
}

// Goals-against penalty uses a softened expectation so the first concession is effectively free.
function projectedGoalsAgainstLambda(row: PlayerPredictionFeatureRow, expectedMinutes: number): number {
  const baseRate = blendedGoalsAgainstRate(row);
  const opponentMultiplier =
    row.position === "D"
      ? toFiniteNumber(row.opponent_goals_against_outfield_multiplier, 1)
      : toFiniteNumber(row.opponent_goals_against_multiplier, 1);
  const teamStrength = clamp(toFiniteNumber(row.team_goals_against_strength, 1), 0.6, 1.5);
  return clamp(baseRate * opponentMultiplier * teamStrength * (expectedMinutes / 90), 0, 5);
}

function buildPlayerWeekKey(row: PlayerPredictionFeatureRow): string {
  return [row.season, String(row.gameweek), row.player_id].join(":");
}

function groupRowsByPlayerWeek(rows: PlayerPredictionFeatureRow[]): PlayerPredictionFeatureRow[][] {
  const grouped = new Map<string, PlayerPredictionFeatureRow[]>();

  for (const row of rows) {
    const key = buildPlayerWeekKey(row);
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((group) =>
    [...group].sort((a, b) => {
      const homeSortA = a.is_home === true ? 0 : a.is_home === false ? 1 : 2;
      const homeSortB = b.is_home === true ? 0 : b.is_home === false ? 1 : 2;
      if (homeSortA !== homeSortB) {
        return homeSortA - homeSortB;
      }

      return String(a.opponent ?? "").localeCompare(String(b.opponent ?? ""));
    })
  );
}

function isSecureStarter(
  row: PlayerPredictionFeatureRow,
  lineupByPlayerId: Map<string, ReturnType<typeof predictLineups>[number]>
): boolean {
  const lineup = lineupByPlayerId.get(row.player_id);
  const startProbability = clamp(
    lineup?.adjusted_start_probability ??
      Math.min(
        toFiniteNumber(row.expected_start_probability_input),
        toFiniteNumber(row.availability_probability, 1)
      ),
    0,
    1
  );

  return (
    lineup?.predicted_starter === true &&
    startProbability >= 0.75 &&
    toFiniteNumber(row.last5_start_rate) >= 0.6 &&
    toFiniteNumber(row.last10_start_rate) >= 0.55 &&
    toFiniteNumber(row.expected_minutes_if_start_input, toFiniteNumber(row.last5_avg_minutes_if_start)) >= 75 &&
    toFiniteNumber(row.availability_probability, 1) >= 0.9
  );
}

function applySecondFixtureAdjustment(
  row: PlayerPredictionFeatureRow,
  startProbability: number,
  expectedMinutes: number,
  lineupByPlayerId: Map<string, ReturnType<typeof predictLineups>[number]>
): DoubleGameweekAdjustment {
  const secureStarter = isSecureStarter(row, lineupByPlayerId);
  const startProbabilityMultiplier = secureStarter ? 0.92 : 0.85;
  const expectedMinutesMultiplier = secureStarter ? 0.9 : 0.85;

  return {
    adjustedStartProbability: clamp(startProbability * startProbabilityMultiplier, 0, 1),
    adjustedExpectedMinutes: clamp(expectedMinutes * expectedMinutesMultiplier, 0, 90),
  };
}

function projectedFloorPoints(components: {
  predictedGhostPts: number;
  predictedGoalPts: number;
  predictedAssistPts: number;
  predictedCsPts: number;
  predictedSavePts: number;
  predictedGaPenalty: number;
}): number {
  return (
    components.predictedGhostPts * 0.9 +
    components.predictedGoalPts * 0.25 +
    components.predictedAssistPts * 0.3 +
    components.predictedCsPts * 0.5 +
    components.predictedSavePts * 0.55 +
    components.predictedGaPenalty
  );
}

function projectedCeilingPoints(components: {
  predictedGhostPts: number;
  predictedGoalPts: number;
  predictedAssistPts: number;
  predictedCsPts: number;
  predictedSavePts: number;
  predictedGaPenalty: number;
}): number {
  return (
    components.predictedGhostPts * 1.05 +
    components.predictedGoalPts * 1.55 +
    components.predictedAssistPts * 1.45 +
    components.predictedCsPts * 1.2 +
    components.predictedSavePts * 1.2 +
    components.predictedGaPenalty
  );
}

function agreementScore(row: PlayerPredictionFeatureRow): number {
  const recentGoalRate = weightedRate(row.last5_goals_per90, row.last10_goals_per90, null);
  const seasonGoalRate = toFiniteNumber(row.season_goals_per90);
  const recentAssistRate = weightedRate(row.last5_assists_per90, row.last10_assists_per90, null);
  const seasonAssistRate = toFiniteNumber(row.season_assists_per90);
  const recentGhostRate = weightedRate(row.last5_ghost_pts_per90, row.last10_ghost_pts_per90, null);
  const seasonGhostRate = toFiniteNumber(row.season_ghost_pts_per90);

  const goalAgreement = 1 - Math.min(Math.abs(recentGoalRate - seasonGoalRate) / Math.max(seasonGoalRate, 0.15), 1);
  const assistAgreement = 1 - Math.min(Math.abs(recentAssistRate - seasonAssistRate) / Math.max(seasonAssistRate, 0.15), 1);
  const ghostAgreement = 1 - Math.min(Math.abs(recentGhostRate - seasonGhostRate) / Math.max(seasonGhostRate, 1), 1);

  return (goalAgreement + assistAgreement + ghostAgreement) / 3;
}

function confidenceScore(params: {
  row: PlayerPredictionFeatureRow;
  startProbability: number;
  expectedMinutes: number;
  predictedGhostPts: number;
  predictedGoalPts: number;
  predictedAssistPts: number;
}): number {
  const minutesFactor = clamp(params.expectedMinutes / 90, 0, 1);
  const availabilityFactor = clamp(toFiniteNumber(params.row.availability_probability, 1), 0, 1);
  const agreementFactor = agreementScore(params.row);
  const attackingReturns = params.predictedGoalPts + params.predictedAssistPts;
  const dependencyPenalty = attackingReturns > 0
    ? clamp(attackingReturns / Math.max(params.predictedGhostPts + attackingReturns, 0.1), 0, 1)
    : 0;
  const ghostFloorFactor = clamp(params.predictedGhostPts / 8, 0, 1);

  const rawScore =
    params.startProbability * 0.3 +
    minutesFactor * 0.25 +
    agreementFactor * 0.2 +
    ghostFloorFactor * 0.15 +
    availabilityFactor * 0.1 -
    dependencyPenalty * 0.15 -
    (1 - availabilityFactor) * 0.1;

  return clamp(rawScore * 100, 0, 100);
}

function predictForRow(
  row: PlayerPredictionFeatureRow,
  lineupByPlayerId: Map<string, ReturnType<typeof predictLineups>[number]>,
  context: FixtureProjectionContext = { fixtureIndex: 0, totalFixtures: 1 }
): PlayerPredictionComponents {
  const lineup = lineupByPlayerId.get(row.player_id);
  const featureStartProbability = clamp(
    Math.min(
      toFiniteNumber(row.expected_start_probability_input),
      toFiniteNumber(row.availability_probability, 1)
    ),
    0,
    1
  );
  const startProbability = clamp(
    lineup?.adjusted_start_probability ?? featureStartProbability,
    0,
    1
  );

  const expectedMinutesIfStart = clamp(
    toFiniteNumber(
      row.expected_minutes_if_start_input,
      row.last5_avg_minutes_if_start ??
        row.last10_avg_minutes_if_start ??
        row.season_avg_minutes_if_start ??
        75
    ),
    0,
    90
  );
  const expectedMinutesIfBench = clamp(
    toFiniteNumber(row.expected_minutes_if_bench_input, row.season_avg_minutes_if_bench ?? 15),
    0,
    45
  );
  const rawExpectedMinutes =
    startProbability * expectedMinutesIfStart + (1 - startProbability) * expectedMinutesIfBench;
  let expectedMinutes = clamp(
    lineup == null
      ? rawExpectedMinutes
      : lineup.predicted_starter
        ? Math.max(rawExpectedMinutes, lineup.adjusted_expected_minutes)
        : Math.min(rawExpectedMinutes, lineup.adjusted_expected_minutes),
    0,
    90
  );
  let effectiveStartProbability = startProbability;

  // Fixture 1 in a DGW is projected normally; fixture 2 gets a fatigue/rotation discount.
  if (context.totalFixtures > 1 && context.fixtureIndex > 0) {
    const fixture2Adjustment = applySecondFixtureAdjustment(
      row,
      effectiveStartProbability,
      expectedMinutes,
      lineupByPlayerId
    );
    effectiveStartProbability = fixture2Adjustment.adjustedStartProbability;
    expectedMinutes = fixture2Adjustment.adjustedExpectedMinutes;
  }

  // Ghost floor from peripherals plus a light historical stabilizer.
  const ghostPointsPer90 = projectedGhostPointsPer90(row);
  const predictedGhostPts = scalePer90ToExpectedMinutes(ghostPointsPer90, expectedMinutes);

  // Attacking return projection: goals and assists are modeled separately.
  const goalRatePer90 = applyOpponentMultiplier(blendedGoalRate(row), row.opponent_goals_multiplier);
  const predictedGoalPts =
    scalePer90ToExpectedMinutes(goalRatePer90, expectedMinutes) * goalPointsByPosition(row.position);

  const assistRatePer90 = applyOpponentMultiplier(blendedAssistRate(row), row.opponent_assists_multiplier);
  const predictedAssistPts =
    scalePer90ToExpectedMinutes(assistRatePer90, expectedMinutes) * assistPointsByPosition(row.position);

  // Clean-sheet projection.
  const cleanSheetRate = projectedCleanSheetRate(row, expectedMinutes);
  const predictedCsPts = cleanSheetRate * cleanSheetPointsByPosition(row.position);

  // Save projection for goalkeepers only.
  const saveRatePer90 = applyOpponentMultiplier(blendedSaveRate(row), row.opponent_saves_multiplier);
  const predictedSavePts =
    row.position === "G"
      ? scalePer90ToExpectedMinutes(saveRatePer90, expectedMinutes) * FANTRAX_SCORING.savePoints
      : 0;

  // Goals-against penalty projection.
  const goalsAgainstLambda = projectedGoalsAgainstLambda(row, expectedMinutes);
  const predictedGaPenalty =
    row.position === "G" || row.position === "D"
      ? expectedGoalsAgainstExcess(goalsAgainstLambda) * FANTRAX_SCORING.goalsAgainstPenalty
      : 0;

  const predictedTotalPts =
    predictedGhostPts +
    predictedGoalPts +
    predictedAssistPts +
    predictedCsPts +
    predictedSavePts +
    predictedGaPenalty;

  const floorPts = projectedFloorPoints({
    predictedGhostPts,
    predictedGoalPts,
    predictedAssistPts,
    predictedCsPts,
    predictedSavePts,
    predictedGaPenalty,
  });
  const ceilingPts = projectedCeilingPoints({
    predictedGhostPts,
    predictedGoalPts,
    predictedAssistPts,
    predictedCsPts,
    predictedSavePts,
    predictedGaPenalty,
  });
  const confidence = confidenceScore({
    row,
    startProbability: effectiveStartProbability,
    expectedMinutes,
    predictedGhostPts,
    predictedGoalPts,
    predictedAssistPts,
  });

  return {
    player_id: row.player_id,
    season: row.season,
    gameweek: row.gameweek,
    team: row.team,
    position: row.position,
    opponent: row.opponent,
    is_home: row.is_home,
    start_probability: roundTo4(effectiveStartProbability),
    expected_minutes_if_start: roundTo2(expectedMinutesIfStart),
    expected_minutes_if_bench: roundTo2(expectedMinutesIfBench),
    expected_minutes: roundTo2(expectedMinutes),
    predicted_ghost_pts: roundTo2(predictedGhostPts),
    predicted_goal_pts: roundTo2(predictedGoalPts),
    predicted_assist_pts: roundTo2(predictedAssistPts),
    predicted_cs_pts: roundTo2(predictedCsPts),
    predicted_save_pts: roundTo2(predictedSavePts),
    predicted_ga_penalty: roundTo2(predictedGaPenalty),
    predicted_total_pts: roundTo2(predictedTotalPts),
    floor_pts: roundTo2(floorPts),
    ceiling_pts: roundTo2(ceilingPts),
    confidence_score: roundTo2(confidence),
  };
}

function aggregatePlayerWeekPredictions(predictions: PlayerPredictionComponents[]): PlayerPredictionComponents {
  const [first, ...rest] = predictions;

  if (!first) {
    throw new Error("Cannot aggregate empty prediction set");
  }

  let totalStartProbability = first.start_probability;
  let totalExpectedMinutes = first.expected_minutes;
  let totalGhostPts = first.predicted_ghost_pts;
  let totalGoalPts = first.predicted_goal_pts;
  let totalAssistPts = first.predicted_assist_pts;
  let totalCsPts = first.predicted_cs_pts;
  let totalSavePts = first.predicted_save_pts;
  let totalGaPenalty = first.predicted_ga_penalty;
  let totalPts = first.predicted_total_pts;
  let totalFloorPts = first.floor_pts;
  let totalCeilingPts = first.ceiling_pts;
  let confidenceScore = first.confidence_score;

  for (const prediction of rest) {
    totalStartProbability += prediction.start_probability;
    totalExpectedMinutes += prediction.expected_minutes;
    totalGhostPts += prediction.predicted_ghost_pts;
    totalGoalPts += prediction.predicted_goal_pts;
    totalAssistPts += prediction.predicted_assist_pts;
    totalCsPts += prediction.predicted_cs_pts;
    totalSavePts += prediction.predicted_save_pts;
    totalGaPenalty += prediction.predicted_ga_penalty;
    totalPts += prediction.predicted_total_pts;
    totalFloorPts += prediction.floor_pts;
    totalCeilingPts += prediction.ceiling_pts;
    confidenceScore = (confidenceScore + prediction.confidence_score) / 2;
  }

  // DGW confidence keeps some upside credit but reflects extra uncertainty from multiple fixtures.
  const dgwConfidence = clamp(confidenceScore - rest.length * 5 + rest.length * 2, 0, 100);

  return {
    ...first,
    start_probability: roundTo4(clamp(totalStartProbability / predictions.length, 0, 1)),
    expected_minutes_if_start: roundTo2(first.expected_minutes_if_start),
    expected_minutes_if_bench: roundTo2(first.expected_minutes_if_bench),
    expected_minutes: roundTo2(totalExpectedMinutes),
    predicted_ghost_pts: roundTo2(totalGhostPts),
    predicted_goal_pts: roundTo2(totalGoalPts),
    predicted_assist_pts: roundTo2(totalAssistPts),
    predicted_cs_pts: roundTo2(totalCsPts),
    predicted_save_pts: roundTo2(totalSavePts),
    predicted_ga_penalty: roundTo2(totalGaPenalty),
    predicted_total_pts: roundTo2(totalPts),
    floor_pts: roundTo2(totalFloorPts),
    ceiling_pts: roundTo2(totalCeilingPts),
    confidence_score: roundTo2(dgwConfidence),
  };
}

export async function loadPlayerPredictionFeatures(
  supabase: SupabaseClient,
  season: string,
  gameweek: number
): Promise<PlayerPredictionFeatureRow[]> {
  const { data, error } = await supabase
    .from("player_prediction_features")
    .select(FEATURE_SELECT)
    .eq("season", season)
    .eq("gameweek", gameweek);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PlayerPredictionFeatureRow[];
}

export function buildPredictions(
  rows: PlayerPredictionFeatureRow[],
  options: BuildPredictionOptions = {}
): PlayerPredictionComponents[] {
  const useLineupAdjustments = options.useLineupAdjustments ?? true;
  const lineupPredictions = useLineupAdjustments ? predictLineups(rows) : [];
  const lineupByPlayerId = new Map(lineupPredictions.map((row) => [row.player_id, row]));
  const playerWeekGroups = groupRowsByPlayerWeek(rows);

  return playerWeekGroups.map((group) => {
    const fixturePredictions = group.map((row, index) =>
      // DGW fixture 1 is normal; later fixtures get fatigue/rotation discount before aggregation.
      predictForRow(row, lineupByPlayerId, {
        fixtureIndex: index,
        totalFixtures: group.length,
      })
    );

    // Final stored row remains one prediction per player-week, summing fixture-level components.
    return aggregatePlayerWeekPredictions(fixturePredictions);
  });
}

export async function generatePredictionsForGameweek(
  supabase: SupabaseClient,
  season: string,
  gameweek: number,
  options: BuildPredictionOptions = {}
): Promise<PlayerPredictionComponents[]> {
  const rows = await loadPlayerPredictionFeatures(supabase, season, gameweek);
  return buildPredictions(rows, options);
}
