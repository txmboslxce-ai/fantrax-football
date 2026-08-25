import { NextResponse } from "next/server";
import { syncLeagueRosterById } from "@/lib/fantrax/sync-rosters-by-id";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
  } catch (err) {
    console.error("[my-league/sync] createServerSupabaseClient error:", err);
    return NextResponse.json({ message: "Failed to initialise database client." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let leagueId: string;
  try {
    const body = (await request.json()) as { leagueId?: unknown };
    if (!body.leagueId || typeof body.leagueId !== "string") {
      return NextResponse.json({ message: "Missing or invalid leagueId" }, { status: 400 });
    }
    leagueId = body.leagueId.trim();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  let result: Awaited<ReturnType<typeof syncLeagueRosterById>>;
  try {
    result = await syncLeagueRosterById(supabase, user.id, leagueId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync league roster.";
    console.error("[my-league/sync] syncLeagueRosterById error:", message);
    return NextResponse.json({ message }, { status: 502 });
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      fantrax_league_id: leagueId,
      fantrax_league_last_synced_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ message: "Failed to update profile." }, { status: 500 });
  }

  return NextResponse.json({
    teams: result.teams,
    playersRostered: result.playersRostered,
    unmatchedPlayers: result.unmatchedFantraxIds,
  });
}
