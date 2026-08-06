import {
  decorateGameweeks,
  mapPosition,
  summarizePlayerWindow,
  type FixtureRow,
  type PlayerGameweekRow,
} from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

const PLAYER_ID_BATCH_SIZE = 100;
const PLAYER_GAMEWEEK_QUERY_COLUMNS =
  "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won";

type WindowKey = "last5" | "last10";

function parseWindow(value: string | null): WindowKey | null {
  return value === "last5" || value === "last10" ? value : null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  const window = parseWindow(searchParams.get("window"));
  const latestGameweek = Number.parseInt(searchParams.get("latestGameweek") ?? "", 10);

  if (!season || !window || !Number.isInteger(latestGameweek) || latestGameweek < 1) {
    return NextResponse.json({ message: "Valid season, window, and latestGameweek parameters are required." }, { status: 400 });
  }

  const startGameweek = Math.max(1, latestGameweek - (window === "last5" ? 4 : 9));
  const { data: poolRows, error: poolError } = await supabase
    .from("season_player_pool")
    .select("fantrax_id")
    .eq("season", season);

  if (poolError) {
    return NextResponse.json({ message: poolError.message }, { status: 500 });
  }

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);
  if (poolFantraxIds.length === 0) {
    return NextResponse.json({ statsByPlayerId: {} });
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, fantrax_id, team, position")
    .in("fantrax_id", poolFantraxIds);

  if (playersError) {
    return NextResponse.json({ message: playersError.message }, { status: 500 });
  }

  const playerRows = (players ?? []) as Array<{ id: string; team: string; position: string }>;
  const playerIdBatches = Array.from(
    { length: Math.ceil(playerRows.length / PLAYER_ID_BATCH_SIZE) },
    (_, index) => playerRows.slice(index * PLAYER_ID_BATCH_SIZE, (index + 1) * PLAYER_ID_BATCH_SIZE).map((player) => player.id)
  );

  const [gameweekResults, fixturesResult] = await Promise.all([
    Promise.all(
      playerIdBatches.map((playerIdBatch) =>
        supabase
          .from("player_gameweeks")
          .select(PLAYER_GAMEWEEK_QUERY_COLUMNS)
          .eq("season", season)
          .gte("gameweek", startGameweek)
          .in("player_id", playerIdBatch)
          .range(0, 40000)
      )
    ),
    supabase
      .from("fixtures")
      .select("id, season, gameweek, home_team, away_team")
      .eq("season", season)
      .gte("gameweek", startGameweek),
  ]);

  const gameweeksError = gameweekResults.find((result) => result.error)?.error;
  if (gameweeksError) {
    return NextResponse.json({ message: gameweeksError.message }, { status: 500 });
  }
  if (fixturesResult.error) {
    return NextResponse.json({ message: fixturesResult.error.message }, { status: 500 });
  }

  const rowsByPlayer = new Map<string, PlayerGameweekRow[]>();
  for (const row of gameweekResults.flatMap((result) => (result.data ?? []) as PlayerGameweekRow[])) {
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) existing.push(row);
    else rowsByPlayer.set(row.player_id, [row]);
  }

  const fixturesByTeam = new Map<string, FixtureRow[]>();
  for (const fixture of (fixturesResult.data ?? []) as FixtureRow[]) {
    for (const team of [fixture.home_team, fixture.away_team]) {
      const existing = fixturesByTeam.get(team);
      if (existing) existing.push(fixture);
      else fixturesByTeam.set(team, [fixture]);
    }
  }

  const statsByPlayerId = Object.fromEntries(
    playerRows.map((player) => {
      const rows = (rowsByPlayer.get(player.id) ?? []).sort((a, b) => a.gameweek - b.gameweek);
      const decoratedRows = decorateGameweeks(rows, player.team, fixturesByTeam.get(player.team) ?? []);
      return [player.id, summarizePlayerWindow(decoratedRows, mapPosition(player.position))];
    })
  );

  return NextResponse.json({ statsByPlayerId });
}
