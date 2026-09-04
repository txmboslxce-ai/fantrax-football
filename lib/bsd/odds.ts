import { bzzoiroGet } from "@/lib/bsd/client";

export type MatchWinProbabilities = { home: number; draw: number; away: number };

type RawOddsRow = {
  market: string;
  outcome: string;
  decimal_odds: number;
};

type RawOddsListResponse = {
  results: RawOddsRow[];
};

// Devigged (bookmaker-margin-removed) consensus win/draw/away probabilities
// for a match's full-time 1X2 market (GET /odds/?event_id=X&market=1x2) --
// used purely as a "how lopsided is this match" signal for the player-level
// game-script adjustment (see gameScriptFactor in playerProjection.ts), not
// converted into expected goals. BSD's own /predictions/ endpoint already
// gives expected_goals directly (lib/bsd/predictions.ts) -- re-deriving
// that number from odds ourselves would just be a noisier reproduction of
// something already computed. "How lopsided" is different: that's exactly
// what a betting market is built to price efficiently with real money,
// which isn't true of BSD's own AI-driven prediction confidence, so odds
// are the more trustworthy source for this specific signal even though
// predictions is the more trustworthy source for the expected-goals number
// itself.
export async function fetchMatchWinProbabilities(eventId: number): Promise<MatchWinProbabilities | null> {
  let data: RawOddsListResponse;
  try {
    data = await bzzoiroGet<RawOddsListResponse>("/odds/", { event_id: String(eventId), market: "1x2" }, 300);
  } catch {
    return null;
  }

  const impliedByOutcome = new Map<string, number>();
  for (const row of data.results ?? []) {
    if (row.market !== "1x2" || !row.decimal_odds || row.decimal_odds <= 0) continue;
    impliedByOutcome.set(row.outcome, 1 / row.decimal_odds);
  }

  const home = impliedByOutcome.get("HOME");
  const draw = impliedByOutcome.get("DRAW");
  const away = impliedByOutcome.get("AWAY");
  if (home == null || draw == null || away == null) {
    return null;
  }

  // Raw implied probabilities sum to > 1 (the bookmaker's margin) --
  // normalize ("devig") so they sum to exactly 1.
  const total = home + draw + away;
  return { home: home / total, draw: draw / total, away: away / total };
}
