import { bzzoiroGet } from "@/lib/bsd/client";

export type MatchExpectedGoals = { home: number; away: number; confidence: number };

type RawPredictionResponse = {
  markets?: { expected_goals?: { home?: number; away?: number } };
  model?: { confidence?: number };
};

// BSD's own AI-driven expected-goals prediction for a match (GET
// /events/{id}/prediction/). Used as one input blended against our own
// BSD-match-stats-derived team strength (see expectedGoalsAgainstTeam in
// playerProjection.ts), weighted by its own reported confidence rather than
// trusted outright -- this is a single model's guess, not a market-tested
// consensus, and this codebase has already found BSD's AI-driven output
// unreliable in at least one other place (RotoWire is used for predicted
// lineups instead of BSD's own for exactly that reason). Returns null for a
// 404 (no active prediction for this match) or any other fetch failure, so
// callers fall back to their own signal alone.
export async function fetchMatchExpectedGoals(eventId: number): Promise<MatchExpectedGoals | null> {
  let data: RawPredictionResponse;
  try {
    data = await bzzoiroGet<RawPredictionResponse>(`/events/${eventId}/prediction/`, {}, 120);
  } catch {
    return null;
  }

  const xg = data.markets?.expected_goals;
  if (typeof xg?.home !== "number" || typeof xg?.away !== "number") {
    return null;
  }

  return { home: xg.home, away: xg.away, confidence: data.model?.confidence ?? 0.5 };
}
