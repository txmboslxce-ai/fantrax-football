import type { SupabaseClient } from "@supabase/supabase-js";

type FantraxRosterItem = {
  id: string;
  position: string;
  status: string;
};

type FantraxTeamRoster = {
  teamName: string;
  rosterItems: FantraxRosterItem[];
  salaryCap: number;
};

type TeamRostersResponse = {
  period: number;
  rosters: Record<string, FantraxTeamRoster>;
};

type PlayerLookup = {
  id: string;
  fantrax_id: string;
};

type RosterInsert = {
  profile_id: string;
  league_id: string;
  team_id: string;
  team_name: string;
  player_id: string;
  fantrax_player_id: string;
};

export async function syncLeagueRosterById(
  supabase: SupabaseClient,
  profileId: string,
  leagueId: string
): Promise<{ teams: number; playersRostered: number; unmatchedFantraxIds: string[] }> {
  const response = await fetch(
    `https://www.fantrax.com/fxea/general/getTeamRosters?leagueId=${encodeURIComponent(leagueId)}`,
    { method: "GET", cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Fantrax roster API returned ${response.status} for league ${leagueId}.`);
  }

  const payload = (await response.json()) as TeamRostersResponse;
  if (!payload.rosters || typeof payload.rosters !== "object" || Array.isArray(payload.rosters)) {
    throw new Error(`Fantrax roster API returned an invalid roster response for league ${leagueId}.`);
  }

  const teams = Object.entries(payload.rosters);
  const rosterItems = teams.flatMap(([teamId, team]) =>
    (Array.isArray(team.rosterItems) ? team.rosterItems : []).flatMap((item) => {
      const fantraxPlayerId = typeof item.id === "string" ? item.id.trim() : "";
      if (!fantraxPlayerId) return [];
      return [{ teamId, teamName: typeof team.teamName === "string" ? team.teamName : "Unknown", fantraxPlayerId }];
    })
  );

  const fantraxPlayerIds = Array.from(new Set(rosterItems.map((item) => item.fantraxPlayerId)));
  const wrappedFantraxIds = fantraxPlayerIds.map((fantraxPlayerId) => `*${fantraxPlayerId}*`);
  const { data: playersData, error: playersError } = wrappedFantraxIds.length
    ? await supabase.from("players").select("id, fantrax_id").in("fantrax_id", wrappedFantraxIds)
    : { data: [], error: null };

  if (playersError) {
    throw new Error(`Failed to load player IDs for roster sync: ${playersError.message}`);
  }

  const playerByFantraxId = new Map(
    ((playersData ?? []) as PlayerLookup[]).map((player) => [player.fantrax_id, player.id])
  );
  const unmatchedFantraxIds = fantraxPlayerIds.filter(
    (fantraxPlayerId) => !playerByFantraxId.has(`*${fantraxPlayerId}*`)
  );
  const inserts = new Map<string, RosterInsert>();

  for (const item of rosterItems) {
    const playerId = playerByFantraxId.get(`*${item.fantraxPlayerId}*`);
    if (!playerId) continue;

    inserts.set(item.fantraxPlayerId, {
      profile_id: profileId,
      league_id: leagueId,
      team_id: item.teamId,
      team_name: item.teamName,
      player_id: playerId,
      fantrax_player_id: item.fantraxPlayerId,
    });
  }

  const { error: deleteError } = await supabase
    .from("league_rosters")
    .delete()
    .eq("profile_id", profileId)
    .eq("league_id", leagueId);

  if (deleteError) {
    throw new Error(`Failed to clear roster data for league ${leagueId}: ${deleteError.message}`);
  }

  const rows = [...inserts.values()];
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("league_rosters").insert(rows);
    if (insertError) {
      throw new Error(`Failed to save roster data for league ${leagueId}: ${insertError.message}`);
    }
  }

  return { teams: teams.length, playersRostered: rows.length, unmatchedFantraxIds };
}
