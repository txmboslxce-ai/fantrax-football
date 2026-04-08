import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type FantraxPlayer = {
  id?: string;
  name?: string;
};

type FantraxTeam = {
  id?: string;
  name?: string;
  roster?: {
    roster?: FantraxPlayer[];
  };
};

type FantraxApiResponse = {
  responses?: Array<{
    data?: {
      fantasyTeams?: FantraxTeam[];
    };
  }>;
};

type RosterInsert = {
  profile_id: string;
  league_id: string;
  team_id: string;
  team_name: string;
  player_id: string;
  fantrax_player_id: string;
};

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
    if (!body.leagueId || typeof body.leagueId !== "string") {
      return NextResponse.json({ message: "Missing or invalid leagueId" }, { status: 400 });
    }
    leagueId = body.leagueId.trim();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  // Fetch all teams and their rosters from the Fantrax public API
  let fantraxData: FantraxApiResponse;
  try {
    const fantraxResponse = await fetch(
      `https://www.fantrax.com/fxpa/req?leagueId=${encodeURIComponent(leagueId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msgs: [{ method: "getTeamRosterInfo", data: { leagueId } }] }),
      }
    );

    if (!fantraxResponse.ok) {
      return NextResponse.json(
        { message: `Fantrax API returned ${fantraxResponse.status}. Check your league ID.` },
        { status: 502 }
      );
    }

    const rawJson = await fantraxResponse.text();
    console.log("[my-league/sync] Fantrax raw response:", rawJson);
    fantraxData = JSON.parse(rawJson) as FantraxApiResponse;
  } catch {
    return NextResponse.json({ message: "Unable to reach Fantrax API." }, { status: 502 });
  }

  const fantasyTeams = fantraxData?.responses?.[0]?.data?.fantasyTeams;
  console.log("[my-league/sync] responses length:", fantraxData?.responses?.length);
  console.log("[my-league/sync] responses[0].data keys:", Object.keys(fantraxData?.responses?.[0]?.data ?? {}));
  console.log("[my-league/sync] fantasyTeams type:", typeof fantasyTeams, Array.isArray(fantasyTeams) ? `array(${fantasyTeams.length})` : fantasyTeams);

  if (!Array.isArray(fantasyTeams) || fantasyTeams.length === 0) {
    return NextResponse.json(
      { message: "No teams found in Fantrax response. Double-check your league ID." },
      { status: 422 }
    );
  }

  // Build a case-insensitive player name → DB id lookup
  const { data: dbPlayers, error: playersError } = await supabase.from("players").select("id, name");

  if (playersError || !dbPlayers) {
    return NextResponse.json({ message: "Failed to load player data." }, { status: 500 });
  }

  const playerIdByName = new Map<string, string>();
  for (const player of dbPlayers) {
    playerIdByName.set((player.name as string).toLowerCase().trim(), player.id as string);
  }

  // Process all teams
  const inserts: RosterInsert[] = [];
  const unmatchedNames: string[] = [];
  let teamsCount = 0;

  for (const team of fantasyTeams) {
    const teamId = team.id ?? "";
    const teamName = team.name ?? "Unknown";
    const rosterPlayers = team.roster?.roster ?? [];
    teamsCount++;

    for (const player of rosterPlayers) {
      const fantraxPlayerId = player.id ?? "";
      const rawName = player.name ?? "";
      const normalizedName = rawName.toLowerCase().trim();

      if (!normalizedName) continue;

      const dbPlayerId = playerIdByName.get(normalizedName);

      if (!dbPlayerId) {
        unmatchedNames.push(rawName);
        continue;
      }

      inserts.push({
        profile_id: user.id,
        league_id: leagueId,
        team_id: teamId,
        team_name: teamName,
        player_id: dbPlayerId,
        fantrax_player_id: fantraxPlayerId,
      });
    }
  }

  // Replace all existing roster data for this user with fresh data
  const { error: deleteError } = await supabase.from("league_rosters").delete().eq("profile_id", user.id);

  if (deleteError) {
    return NextResponse.json({ message: "Failed to clear existing roster data." }, { status: 500 });
  }

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("league_rosters").insert(inserts);

    if (insertError) {
      return NextResponse.json({ message: `Failed to save roster data: ${insertError.message}` }, { status: 500 });
    }
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
    teams: teamsCount,
    playersRostered: inserts.length,
    unmatchedPlayers: unmatchedNames,
  });
}
