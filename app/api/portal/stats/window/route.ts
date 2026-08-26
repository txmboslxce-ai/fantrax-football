import {
  PLAYER_WINDOW_STATS_COLUMNS,
  emptyWindowStatsRow,
  toStatsWindowRow,
  type PlayerWindowStatsRow,
} from "@/lib/portal/summaryAdapters";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// Last 5 / Last 10 are precomputed by lib/portal/summaryRecompute.ts
// alongside the season window, so switching this toggle is now a lookup
// against player_window_stats rather than a fresh recalculation across the
// whole player pool.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  const window = searchParams.get("window");
  if (!season || (window !== "last5" && window !== "last10")) {
    return NextResponse.json({ message: "Valid season and window parameters are required." }, { status: 400 });
  }

  const { data: poolRows, error: poolError } = await supabase.from("season_player_pool").select("fantrax_id").eq("season", season);
  if (poolError) return NextResponse.json({ message: poolError.message }, { status: 500 });

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);
  if (poolFantraxIds.length === 0) return NextResponse.json({ statsByPlayerId: {} });

  const { data: players, error: playersError } = await supabase.from("players").select("id").in("fantrax_id", poolFantraxIds);
  if (playersError) return NextResponse.json({ message: playersError.message }, { status: 500 });

  const playerIds = (players ?? []).map((player) => player.id as string);
  if (playerIds.length === 0) return NextResponse.json({ statsByPlayerId: {} });

  const { data: windowRows, error: windowError } = await supabase
    .from("player_window_stats")
    .select(PLAYER_WINDOW_STATS_COLUMNS)
    .eq("season", season)
    .eq("window", window)
    .in("player_id", playerIds);
  if (windowError) return NextResponse.json({ message: windowError.message }, { status: 500 });

  const windowRowByPlayer = new Map<string, PlayerWindowStatsRow>(
    ((windowRows ?? []) as PlayerWindowStatsRow[]).map((row) => [row.player_id, row])
  );

  return NextResponse.json({
    statsByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [
        playerId,
        toStatsWindowRow(windowRowByPlayer.get(playerId) ?? emptyWindowStatsRow(playerId, season, window)),
      ])
    ),
  });
}
