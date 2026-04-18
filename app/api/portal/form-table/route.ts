import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type FormTableApiRow = {
  id: string;
  player_id: string;
  season: string;
  gameweek: number;
  games_played: number | null;
  games_started: number | null;
  minutes_played: number | null;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
  goals: number | null;
  assists: number | null;
  key_passes: number | null;
  shots_on_target: number | null;
  penalties_drawn: number | null;
  penalties_missed: number | null;
  clean_sheet: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  aerials_won: number | null;
  blocked_shots: number | null;
  dribbles_succeeded: number | null;
  goals_against_outfield: number | null;
  saves: number | null;
  goals_against: number | null;
  penalty_saves: number | null;
  high_claims: number | null;
  smothers: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  own_goals: number | null;
  corner_kicks: number | null;
  free_kick_shots: number | null;
};

function parseGameweeks(raw: string | null): number[] {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season");
  const gameweeks = parseGameweeks(searchParams.get("gameweeks"));

  if (!season) {
    return NextResponse.json({ message: "Missing season parameter." }, { status: 400 });
  }

  if (gameweeks.length === 0) {
    return NextResponse.json({ message: "Missing gameweeks parameter." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("player_gameweeks")
    .select(
      "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, key_passes, shots_on_target, penalties_drawn, penalties_missed, clean_sheet, tackles_won, interceptions, clearances, aerials_won, blocked_shots, dribbles_succeeded, goals_against_outfield, saves, goals_against, penalty_saves, high_claims, smothers, yellow_cards, red_cards, own_goals, corner_kicks, free_kick_shots"
    )
    .eq("season", season)
    .in("gameweek", gameweeks)
    .limit(50000);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: (data ?? []) as FormTableApiRow[] });
}
