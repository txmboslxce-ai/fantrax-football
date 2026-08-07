import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

type StatsPlayerGameweekRow = {
  player_id: string;
  games_played: number;
  games_started: number;
  minutes_played: number;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
  goals: number | null;
  assists: number | null;
  key_passes: number | null;
  shots_on_target: number | null;
  dribbles_succeeded: number | null;
  dispossessed: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  blocked_shots: number | null;
  aerials_won: number | null;
  accurate_crosses: number | null;
  goals_against_outfield: number | null;
  clean_sheet: number | null;
  saves: number | null;
  penalty_saves: number | null;
  goals_against: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  own_goals: number | null;
  penalties_missed: number | null;
  penalties_drawn: number | null;
  corner_kicks: number | null;
  free_kick_shots: number | null;
};

const PLAYER_ID_BATCH_SIZE = 100;
const STATS_GAMEWEEK_QUERY_COLUMNS =
  "player_id, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, key_passes, shots_on_target, dribbles_succeeded, dispossessed, tackles_won, interceptions, clearances, blocked_shots, aerials_won, accurate_crosses, goals_against_outfield, clean_sheet, saves, penalty_saves, goals_against, yellow_cards, red_cards, own_goals, penalties_missed, penalties_drawn, corner_kicks, free_kick_shots";

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarizeStatsWindow(rows: StatsPlayerGameweekRow[]) {
  const playedRows = rows.filter((row) => Number(row.games_played ?? 0) > 0);
  const totalSeasonPts = playedRows.reduce((sum, row) => sum + toNumber(row.raw_fantrax_pts), 0);
  const totalGhostPts = playedRows.reduce((sum, row) => sum + toNumber(row.ghost_pts), 0);
  const playedGameweeks = playedRows.length;
  const total = (key: Exclude<keyof StatsPlayerGameweekRow, "player_id" | "raw_fantrax_pts" | "ghost_pts">) =>
    playedRows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);

  return {
    season_pts: roundTo2(totalSeasonPts),
    avg_pts_per_gw: roundTo2(playedGameweeks > 0 ? totalSeasonPts / playedGameweeks : 0),
    ghost_pts_per_gw: roundTo2(playedGameweeks > 0 ? totalGhostPts / playedGameweeks : 0),
    goals: total("goals"), assists: total("assists"), key_passes: total("key_passes"), shots_on_target: total("shots_on_target"),
    dribbles_succeeded: total("dribbles_succeeded"), dispossessed: total("dispossessed"), tackles_won: total("tackles_won"), interceptions: total("interceptions"),
    clearances: total("clearances"), blocked_shots: total("blocked_shots"), aerials_won: total("aerials_won"), accurate_crosses: total("accurate_crosses"),
    goals_against_outfield: total("goals_against_outfield"), clean_sheets: total("clean_sheet"), saves: total("saves"), penalty_saves: total("penalty_saves"),
    goals_against: total("goals_against"), yellow_cards: total("yellow_cards"), red_cards: total("red_cards"), own_goals: total("own_goals"),
    penalties_missed: total("penalties_missed"), penalties_drawn: total("penalties_drawn"), games_played: total("games_played"), games_started: total("games_started"),
    minutes_played: total("minutes_played"), corner_kicks: total("corner_kicks"), free_kick_shots: total("free_kick_shots"),
  };
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  const window = searchParams.get("window");
  const latestGameweek = Number.parseInt(searchParams.get("latestGameweek") ?? "", 10);
  if (!season || (window !== "last5" && window !== "last10") || !Number.isInteger(latestGameweek) || latestGameweek < 1) {
    return NextResponse.json({ message: "Valid season, window, and latestGameweek parameters are required." }, { status: 400 });
  }

  const startGameweek = Math.max(1, latestGameweek - (window === "last5" ? 4 : 9));
  const { data: poolRows, error: poolError } = await supabase.from("season_player_pool").select("fantrax_id").eq("season", season);
  if (poolError) return NextResponse.json({ message: poolError.message }, { status: 500 });

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);
  if (poolFantraxIds.length === 0) return NextResponse.json({ statsByPlayerId: {} });

  const { data: players, error: playersError } = await supabase.from("players").select("id").in("fantrax_id", poolFantraxIds);
  if (playersError) return NextResponse.json({ message: playersError.message }, { status: 500 });

  const playerIds = (players ?? []).map((player) => player.id as string);
  const playerIdBatches = Array.from(
    { length: Math.ceil(playerIds.length / PLAYER_ID_BATCH_SIZE) },
    (_, index) => playerIds.slice(index * PLAYER_ID_BATCH_SIZE, (index + 1) * PLAYER_ID_BATCH_SIZE)
  );
  const gameweekResults = await Promise.all(
    playerIdBatches.map((playerIdBatch) =>
      supabase
        .from("player_gameweeks")
        .select(STATS_GAMEWEEK_QUERY_COLUMNS)
        .eq("season", season)
        .gte("gameweek", startGameweek)
        .in("player_id", playerIdBatch)
        .range(0, 40000)
    )
  );
  const gameweeksError = gameweekResults.find((result) => result.error)?.error;
  if (gameweeksError) return NextResponse.json({ message: gameweeksError.message }, { status: 500 });

  const rowsByPlayer = new Map<string, StatsPlayerGameweekRow[]>();
  for (const row of gameweekResults.flatMap((result) => (result.data ?? []) as StatsPlayerGameweekRow[])) {
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) existing.push(row);
    else rowsByPlayer.set(row.player_id, [row]);
  }

  return NextResponse.json({
    statsByPlayerId: Object.fromEntries(playerIds.map((playerId) => [playerId, summarizeStatsWindow(rowsByPlayer.get(playerId) ?? [])])),
  });
}
