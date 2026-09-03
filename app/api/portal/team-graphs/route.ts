import { NextResponse } from "next/server";
import { fetchTeamGraphsData, type GameweekFixture, type RosterPlayerInfo } from "@/lib/bsd/teamGraphs";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type RosterRow = { player_id: string };
type PlayerRow = { id: string; name: string; bsd_id: number | null };
type FixtureRow = { id: string; home_team: string; away_team: string; kickoff_at: string | null };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");
  const teamId = searchParams.get("teamId");
  const gameweek = Number.parseInt(searchParams.get("gameweek") ?? "", 10);

  if (!leagueId || !teamId || !Number.isInteger(gameweek) || gameweek <= 0) {
    return NextResponse.json({ message: "Missing or invalid leagueId/teamId/gameweek" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // league_rosters is scoped to (profile_id, league_id) covering every team
  // in that league -- the same data the Roster tab's team dropdown already
  // reads from -- so this only ever exposes rosters the signed-in user has
  // already synced into their own account.
  const { data: rosterRows, error: rosterError } = await supabase
    .from("league_rosters")
    .select("player_id")
    .eq("profile_id", user.id)
    .eq("league_id", leagueId)
    .eq("team_id", teamId);

  if (rosterError) {
    return NextResponse.json({ message: rosterError.message }, { status: 500 });
  }

  const playerIds = ((rosterRows ?? []) as RosterRow[]).map((row) => row.player_id);
  if (playerIds.length === 0) {
    return NextResponse.json({ message: "No roster found for this team -- try re-syncing your league." }, { status: 404 });
  }

  const { data: playerRows, error: playerError } = await supabase.from("players").select("id, name, bsd_id").in("id", playerIds);

  if (playerError) {
    return NextResponse.json({ message: playerError.message }, { status: 500 });
  }

  const bsdIdToPlayer = new Map<number, RosterPlayerInfo>();
  const unmappedPlayerNames: string[] = [];
  for (const player of (playerRows ?? []) as PlayerRow[]) {
    if (player.bsd_id != null) {
      bsdIdToPlayer.set(player.bsd_id, { fantraxId: player.id, name: player.name });
    } else {
      unmappedPlayerNames.push(player.name);
    }
  }

  const { data: fixtureRows, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, kickoff_at")
    .eq("season", FIXTURES_SEASON)
    .eq("gameweek", gameweek);

  if (fixtureError) {
    return NextResponse.json({ message: fixtureError.message }, { status: 500 });
  }

  const fixtures: GameweekFixture[] = ((fixtureRows ?? []) as FixtureRow[]).map((fixture) => ({
    id: fixture.id,
    homeAbbrev: fixture.home_team,
    awayAbbrev: fixture.away_team,
    kickoffAt: fixture.kickoff_at,
  }));

  try {
    const { shots, averagePositions } = await fetchTeamGraphsData(fixtures, bsdIdToPlayer);
    return NextResponse.json({ gameweek, unmappedPlayerNames, shots, averagePositions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load match data for this gameweek";
    return NextResponse.json({ message }, { status: 502 });
  }
}
