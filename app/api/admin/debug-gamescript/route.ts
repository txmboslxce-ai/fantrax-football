import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { fetchMatchWinProbabilities, type MatchWinProbabilities } from "@/lib/bsd/odds";
import { findBsdEventId } from "@/lib/bsd/events";
import { computeTeamStrengthRatings } from "@/lib/projections/teamStrength";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Temporary diagnostic: for every side of every fixture in a gameweek,
// reports the team-strength-derived opponentFactor("expected_goals") next
// to the odds-derived gameScriptFactor (same formula as
// playerProjection.ts's gameScriptFactor -- duplicated here rather than
// exported, to avoid touching the production module for a throwaway
// check), plus their correlation across the whole gameweek. Confirmed
// live: a GW4 projections export showed whole starting XIs (Arsenal vs
// Sunderland, Chelsea vs Hull, Spurs vs Everton) simultaneously pushed
// above 10 points, the signature of two factors rewarding the same
// "this team is much stronger" signal twice -- this measures whether
// that's actually true before touching either constant. Remove once
// resolved.
const GAME_SCRIPT_SENSITIVITY = 0.3;
const GAME_SCRIPT_MIN = 0.7;
const GAME_SCRIPT_MAX = 1.3;

function gameScriptFactor(winProbabilities: MatchWinProbabilities | null, isHome: boolean): number {
  if (!winProbabilities) return 1;
  const ownWinProb = isHome ? winProbabilities.home : winProbabilities.away;
  const oppWinProb = isHome ? winProbabilities.away : winProbabilities.home;
  const factor = 1 + GAME_SCRIPT_SENSITIVITY * (ownWinProb - oppWinProb);
  return Math.min(GAME_SCRIPT_MAX, Math.max(GAME_SCRIPT_MIN, factor));
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx2 = 0,
    dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx,
      dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return num / Math.sqrt(dx2 * dy2);
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const gameweek = Number.parseInt(new URL(request.url).searchParams.get("gameweek") ?? "", 10);
  if (!Number.isInteger(gameweek) || gameweek <= 0) {
    return NextResponse.json({ message: "Missing or invalid ?gameweek=" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? supabase;

  const { data: fixtureRows, error: fixtureError } = await db
    .from("fixtures")
    .select("id, home_team, away_team, kickoff_at")
    .eq("season", FIXTURES_SEASON)
    .eq("gameweek", gameweek);
  if (fixtureError) {
    return NextResponse.json({ message: fixtureError.message }, { status: 500 });
  }
  const fixtures = (fixtureRows ?? []) as Array<{ id: string; home_team: string; away_team: string; kickoff_at: string | null }>;

  const { profiles: teamStrength, leagueAvgPerMatch } = await computeTeamStrengthRatings(db);

  const rows: Array<{ fixture: string; team: string; opponent: string; opponentFactor: number; scriptFactor: number }> = [];

  for (const fixture of fixtures) {
    let winProbabilities: MatchWinProbabilities | null = null;
    if (fixture.kickoff_at) {
      try {
        const eventId = await findBsdEventId({ homeAbbrev: fixture.home_team, awayAbbrev: fixture.away_team, kickoffAt: fixture.kickoff_at });
        if (eventId) winProbabilities = await fetchMatchWinProbabilities(eventId);
      } catch {
        winProbabilities = null;
      }
    }

    for (const [team, opponent, isHome] of [
      [fixture.home_team, fixture.away_team, true],
      [fixture.away_team, fixture.home_team, false],
    ] as const) {
      const opponentStrength = teamStrength.get(opponent);
      // Mirrors opponentFactor(opponentStrength, "expected_goals") in
      // playerProjection.ts exactly -- how easy this specific opponent is to
      // score against, already relative to league average internally.
      const factor = opponentStrength?.concededFactor.expected_goals ?? 1;
      rows.push({
        fixture: `${fixture.home_team} vs ${fixture.away_team}`,
        team,
        opponent,
        opponentFactor: Math.round(factor * 1000) / 1000,
        scriptFactor: Math.round(gameScriptFactor(winProbabilities, isHome) * 1000) / 1000,
      });
    }
  }

  const correlation = rows.length > 1 ? Math.round(pearson(rows.map((r) => r.opponentFactor), rows.map((r) => r.scriptFactor)) * 1000) / 1000 : null;

  return NextResponse.json({ gameweek, leagueAvgExpectedGoals: leagueAvgPerMatch.expected_goals, rows, correlation });
}
