import { NextResponse } from "next/server";
import { syncLeagueRosterById } from "@/lib/fantrax/sync-rosters-by-id";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let leagueId: string;
  try {
    const body = (await request.json()) as { leagueId?: unknown };
    if (typeof body.leagueId !== "string" || !body.leagueId.trim()) {
      return NextResponse.json({ message: "Missing or invalid leagueId" }, { status: 400 });
    }
    leagueId = body.leagueId.trim();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const { data: league, error: leagueError } = await supabase
    .from("user_fantrax_leagues")
    .select("league_id, team_id, team_name")
    .eq("profile_id", user.id)
    .eq("league_id", leagueId)
    .maybeSingle();

  if (leagueError) {
    return NextResponse.json({ message: `Failed to load Fantrax league: ${leagueError.message}` }, { status: 500 });
  }

  if (!league) {
    return NextResponse.json({ message: "Fantrax league not found" }, { status: 404 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ message: "SUPABASE_SERVICE_ROLE_KEY is required for league switching." }, { status: 500 });
  }

  try {
    const { count, error: rosterCountError } = await admin
      .from("league_rosters")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("league_id", leagueId);

    if (rosterCountError) {
      throw new Error(`Failed to check roster freshness: ${rosterCountError.message}`);
    }

    if (count === 0) {
      await syncLeagueRosterById(admin, user.id, leagueId);
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        fantrax_league_id: league.league_id,
        fantrax_team_id: league.team_id,
        fantrax_team_name: league.team_name,
      })
      .eq("id", user.id);

    if (profileError) {
      throw new Error(`Failed to set active Fantrax league: ${profileError.message}`);
    }

    return NextResponse.json({ ok: true, leagueId: league.league_id, teamId: league.team_id, teamName: league.team_name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to switch Fantrax league.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
