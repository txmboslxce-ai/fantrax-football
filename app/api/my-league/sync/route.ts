import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Step 1 response — team list
type FantraxTeamEntry = {
  id?: string;
  name?: string;
};

type TeamsListResponse = {
  responses?: Array<{
    data?: {
      fantasyTeams?: FantraxTeamEntry[];
    };
  }>;
};

// Step 2 response — per-team roster
type FantraxScorer = {
  name?: string;
  scorerId?: string;
};

type FantraxRosterRow = {
  scorer?: FantraxScorer;
};

type FantraxTable = {
  rows?: FantraxRosterRow[];
};

type TeamRosterResponse = {
  responses?: Array<{
    data?: {
      tables?: FantraxTable[];
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

async function fantraxPost<T>(leagueId: string, msgs: unknown[]): Promise<T> {
  const response = await fetch(
    `https://www.fantrax.com/fxpa/req?leagueId=${encodeURIComponent(leagueId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgs }),
    }
  );

  if (!response.ok) {
    throw new Error(`Fantrax API returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

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

  // Step 1 — get all fantasy teams in the league
  let teamsData: TeamsListResponse;
  try {
    teamsData = await fantraxPost<TeamsListResponse>(leagueId, [
      { method: "getTeamRosterInfo", data: { leagueId } },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to reach Fantrax API.";
    return NextResponse.json({ message }, { status: 502 });
  }

  const fantasyTeams = teamsData?.responses?.[0]?.data?.fantasyTeams;
  console.log("[my-league/sync] fantasyTeams sample (first 2):", JSON.stringify(fantasyTeams?.slice(0, 2)));

  if (!Array.isArray(fantasyTeams) || fantasyTeams.length === 0) {
    return NextResponse.json(
      { message: "No teams found in Fantrax response. Double-check your league ID." },
      { status: 422 }
    );
  }

  // Build player name → DB id lookup
  const { data: dbPlayers, error: playersError } = await supabase.from("players").select("id, name");

  if (playersError || !dbPlayers) {
    return NextResponse.json({ message: "Failed to load player data." }, { status: 500 });
  }

  const playerIdByName = new Map<string, string>();
  for (const player of dbPlayers) {
    playerIdByName.set((player.name as string).toLowerCase().trim(), player.id as string);
  }

  // Step 2 — fetch each team's roster individually
  const inserts: RosterInsert[] = [];
  const unmatchedNames: string[] = [];

  for (const team of fantasyTeams) {
    const teamId = team.id ?? "";
    const teamName = team.name ?? "Unknown";

    let rosterData: TeamRosterResponse;
    try {
      rosterData = await fantraxPost<TeamRosterResponse>(leagueId, [
        { method: "getTeamRosterInfo", data: { leagueId, fantasyTeamId: teamId } },
      ]);
    } catch {
      console.warn(`[my-league/sync] Failed to fetch roster for team ${teamId} (${teamName}), skipping.`);
      continue;
    }

    const tables = rosterData?.responses?.[0]?.data?.tables ?? [];

    if (inserts.length === 0) {
      // Log structure for the first team only
      console.log(`[my-league/sync] first team (${teamId}) tables count:`, tables.length);
      console.log(`[my-league/sync] first team first table rows sample:`, JSON.stringify(tables[0]?.rows?.slice(0, 2)));
    }

    for (const table of tables) {
      for (const row of table.rows ?? []) {
        if (!row.scorer) continue;

        const rawName = row.scorer.name ?? "";
        const fantraxPlayerId = row.scorer.scorerId ?? "";
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
  }

  // Replace existing roster data with fresh data
  const { error: deleteError } = await supabase.from("league_rosters").delete().eq("profile_id", user.id);

  if (deleteError) {
    console.error("[my-league/sync] deleteError:", JSON.stringify(deleteError));
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
    teams: fantasyTeams.length,
    playersRostered: inserts.length,
    unmatchedPlayers: unmatchedNames,
  });
}
