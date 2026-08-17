import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const [{ data: leagues, error: leaguesError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("user_fantrax_leagues")
      .select("id, league_id, league_name, team_id, team_name, sport, last_synced_at, created_at")
      .eq("profile_id", user.id)
      .order("league_name"),
    supabase.from("profiles").select("fantrax_league_id").eq("id", user.id).maybeSingle(),
  ]);

  if (leaguesError || profileError) {
    return NextResponse.json({ message: leaguesError?.message ?? profileError?.message ?? "Failed to load Fantrax leagues." }, { status: 500 });
  }

  return NextResponse.json({ leagues: leagues ?? [], activeLeagueId: profile?.fantrax_league_id ?? null });
}
