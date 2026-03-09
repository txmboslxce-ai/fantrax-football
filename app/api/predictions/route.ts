import { NextResponse } from "next/server";
import { SEASON } from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PositionFilter = "G" | "D" | "M" | "F";

type PredictionJoinedRow = {
  player_id: string;
  predicted_pts: number | string | null;
  form_signal: number | string | null;
  fixture_score: number | string | null;
  home_away_adj: number | string | null;
  consistency_pts: number | string | null;
  minutes_modifier: number | string | null;
  volatility_label: string | null;
  generated_at: string | null;
  players:
    | {
        name: string;
        team: string;
        position: PositionFilter;
        ownership_pct: string | null;
      }
    | Array<{
        name: string;
        team: string;
        position: PositionFilter;
        ownership_pct: string | null;
      }>
    | null;
};

type FixtureRow = {
  home_team: string;
  away_team: string;
};

type TeamRow = {
  abbrev: string;
  name: string | null;
  full_name: string | null;
};

type TrendDirection = "up" | "down" | "flat";

type TrendGameweekRow = {
  player_id: string;
  gameweek: number;
  games_played: number | null;
  games_started: number | null;
  raw_fantrax_pts: number | string | null;
};

function parseNumeric(value: number | string | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function deriveTrend(rows: TrendGameweekRow[]): TrendDirection {
  const started = rows
    .filter((row) => Number(row.games_played ?? 0) > 0 && Number(row.games_started ?? 0) > 0)
    .sort((a, b) => b.gameweek - a.gameweek)
    .slice(0, 6)
    .map((row) => parseNumeric(row.raw_fantrax_pts) ?? 0);

  if (started.length < 6) {
    return "flat";
  }

  const recent = started.slice(0, 3);
  const prior = started.slice(3, 6);

  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const priorAvg = prior.reduce((sum, value) => sum + value, 0) / prior.length;

  if (Math.abs(priorAvg) < 0.001) {
    if (Math.abs(recentAvg) < 0.001) {
      return "flat";
    }
    return recentAvg > 0 ? "up" : "down";
  }

  const pctDiff = (recentAvg - priorAvg) / Math.abs(priorAvg);
  if (Math.abs(pctDiff) <= 0.1) {
    return "flat";
  }

  return pctDiff > 0 ? "up" : "down";
}

function toDifficulty(score: number | null): "easy" | "medium" | "hard" | "unknown" {
  if (score == null) {
    return "unknown";
  }

  if (score >= 6.67) {
    return "easy";
  }
  if (score >= 3.34) {
    return "medium";
  }
  return "hard";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const season = String(searchParams.get("season") ?? SEASON).trim() || SEASON;
  const gameweekRaw = Number(searchParams.get("gameweek"));
  const gameweek = Number.isInteger(gameweekRaw) && gameweekRaw > 0 ? gameweekRaw : null;

  if (!gameweek) {
    return NextResponse.json({ success: false, message: "gameweek query param is required" }, { status: 400 });
  }

  const positionParam = String(searchParams.get("position") ?? "").trim().toUpperCase();
  const position = (["G", "D", "M", "F"] as const).includes(positionParam as PositionFilter)
    ? (positionParam as PositionFilter)
    : null;

  const limitRaw = Number(searchParams.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("player_predictions")
    .select(
      "player_id, predicted_pts, form_signal, fixture_score, home_away_adj, consistency_pts, minutes_modifier, volatility_label, generated_at, players!inner(name, team, position, ownership_pct)"
    )
    .eq("season", season)
    .eq("gameweek", gameweek)
    .order("predicted_pts", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (position) {
    query = query.eq("players.position", position);
  }

  const [{ data: predictionData, error: predictionsError }, { data: fixturesData, error: fixturesError }, { data: teamsData, error: teamsError }] =
    await Promise.all([
      query,
      supabase.from("fixtures").select("home_team, away_team").eq("season", season).eq("gameweek", gameweek),
      supabase.from("teams").select("abbrev, name, full_name"),
    ]);

  if (predictionsError) {
    return NextResponse.json({ success: false, message: predictionsError.message }, { status: 500 });
  }

  if (fixturesError) {
    return NextResponse.json({ success: false, message: fixturesError.message }, { status: 500 });
  }

  if (teamsError) {
    return NextResponse.json({ success: false, message: teamsError.message }, { status: 500 });
  }

  const fixtureRows = (fixturesData ?? []) as FixtureRow[];
  const teamNameByAbbrev = new Map<string, string>(
    ((teamsData ?? []) as TeamRow[]).map((team) => [team.abbrev, team.name || team.full_name || team.abbrev])
  );

  const rows = (predictionData ?? []) as PredictionJoinedRow[];
  const playerIds = rows.map((row) => row.player_id);

  let trendByPlayer = new Map<string, TrendDirection>();
  if (playerIds.length > 0) {
    const { data: trendRowsData, error: trendRowsError } = await supabase
      .from("player_gameweeks")
      .select("player_id, gameweek, games_played, games_started, raw_fantrax_pts")
      .eq("season", season)
      .lte("gameweek", gameweek - 1)
      .in("player_id", playerIds)
      .order("gameweek", { ascending: false });

    if (trendRowsError) {
      return NextResponse.json({ success: false, message: trendRowsError.message }, { status: 500 });
    }

    const grouped = new Map<string, TrendGameweekRow[]>();
    for (const row of (trendRowsData ?? []) as TrendGameweekRow[]) {
      const existing = grouped.get(row.player_id) ?? [];
      existing.push(row);
      grouped.set(row.player_id, existing);
    }

    trendByPlayer = new Map<string, TrendDirection>(
      Array.from(grouped.entries()).map(([playerId, trendRows]) => [playerId, deriveTrend(trendRows)])
    );
  }

  const payload = rows.map((row) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;

    if (!player) {
      return null;
    }

    const fixture = fixtureRows.find((candidate) => candidate.home_team === player.team || candidate.away_team === player.team);
    const isHome = fixture ? fixture.home_team === player.team : null;
    const opponentAbbrev = fixture ? (isHome ? fixture.away_team : fixture.home_team) : null;
    const predictedPts = parseNumeric(row.predicted_pts);
    const fixtureScore = parseNumeric(row.fixture_score);

    return {
      playerId: row.player_id,
      playerName: player.name,
      team: player.team,
      position: player.position,
      ownershipPct: parseOwnership(player.ownership_pct),
      opponentAbbrev,
      opponentName: opponentAbbrev ? teamNameByAbbrev.get(opponentAbbrev) ?? opponentAbbrev : null,
      isHome,
      predictedPts,
      formSignal: parseNumeric(row.form_signal),
      fixtureScore,
      homeAwayAdj: parseNumeric(row.home_away_adj),
      consistencyPts: parseNumeric(row.consistency_pts),
      minutesModifier: parseNumeric(row.minutes_modifier),
      volatilityLabel: row.volatility_label,
      trend: trendByPlayer.get(row.player_id) ?? "flat",
      generatedAt: row.generated_at,
      fixtureDifficulty: toDifficulty(fixtureScore),
    };
  });

  const filteredPayload = payload.filter((row): row is NonNullable<(typeof payload)[number]> => row !== null);

  return NextResponse.json({ success: true, rows: filteredPayload });
}
