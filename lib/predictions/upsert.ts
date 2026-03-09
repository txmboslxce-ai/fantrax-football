import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerPredictionComponents } from "@/lib/predictions/types";

type PlayerPredictionUpsertRow = {
  player_id: string;
  season: string;
  gameweek: number;
  predicted_pts: number;
  start_probability: number;
  expected_minutes_if_start: number;
  expected_minutes_if_bench: number;
  expected_minutes: number;
  predicted_ghost_pts: number;
  predicted_goal_pts: number;
  predicted_assist_pts: number;
  predicted_cs_pts: number;
  predicted_save_pts: number;
  predicted_ga_penalty: number;
  predicted_total_pts: number;
  floor_pts: number;
  ceiling_pts: number;
  confidence_score: number;
  generated_at: string;
};

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePredictionRow(row: PlayerPredictionComponents, generatedAt: string): PlayerPredictionUpsertRow {
  const predictedTotalPts = roundTo2(row.predicted_total_pts);
  const floorPts = roundTo2(Math.min(row.floor_pts, predictedTotalPts));
  const ceilingPts = roundTo2(Math.max(row.ceiling_pts, predictedTotalPts));

  return {
    player_id: row.player_id,
    season: row.season,
    gameweek: row.gameweek,
    // Backward compatibility for existing API/UI consumers.
    predicted_pts: predictedTotalPts,
    start_probability: row.start_probability,
    expected_minutes_if_start: row.expected_minutes_if_start,
    expected_minutes_if_bench: row.expected_minutes_if_bench,
    expected_minutes: row.expected_minutes,
    predicted_ghost_pts: row.predicted_ghost_pts,
    predicted_goal_pts: row.predicted_goal_pts,
    predicted_assist_pts: row.predicted_assist_pts,
    predicted_cs_pts: row.predicted_cs_pts,
    predicted_save_pts: row.predicted_save_pts,
    predicted_ga_penalty: row.predicted_ga_penalty,
    predicted_total_pts: predictedTotalPts,
    floor_pts: floorPts,
    ceiling_pts: ceilingPts,
    confidence_score: row.confidence_score,
    generated_at: generatedAt,
  };
}

export async function upsertPlayerPredictions(
  supabase: SupabaseClient,
  predictions: PlayerPredictionComponents[]
): Promise<number> {
  if (predictions.length === 0) {
    return 0;
  }

  const generatedAt = new Date().toISOString();
  const rows = predictions.map((prediction) => normalizePredictionRow(prediction, generatedAt));

  const { error } = await supabase.from("player_predictions").upsert(rows, {
    onConflict: "player_id,season,gameweek",
  });

  if (error) {
    throw new Error(error.message);
  }

  return rows.length;
}
