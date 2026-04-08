import { createServerSupabaseClient } from "@/lib/supabase-server";

export type LeagueRosterData = {
  rosteredPlayerIds: string[];
  teamByPlayerId: Record<string, string>;
};

export async function getUserLeagueRoster(userId: string): Promise<LeagueRosterData | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("league_rosters")
    .select("player_id, team_name")
    .eq("profile_id", userId);

  if (error || !data || data.length === 0) {
    return null;
  }

  const rosteredPlayerIds = data.map((r) => r.player_id as string);
  const teamByPlayerId = Object.fromEntries(data.map((r) => [r.player_id as string, r.team_name as string]));

  return { rosteredPlayerIds, teamByPlayerId };
}
