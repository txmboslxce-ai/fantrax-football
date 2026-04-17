import { createServerSupabaseClient } from "@/lib/supabase-server";

export type LeagueRosterData = {
  rosteredPlayerIds: string[];
  teamByPlayerId: Record<string, string>;
  myTeamPlayerIds: string[];
};

export async function getUserLeagueRoster(userId: string): Promise<LeagueRosterData | null> {
  const supabase = await createServerSupabaseClient();

  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase.from("league_rosters").select("player_id, team_id, team_name").eq("profile_id", userId),
    supabase.from("profiles").select("fantrax_team_id").eq("id", userId).maybeSingle(),
  ]);

  if (error || !data || data.length === 0) {
    return null;
  }

  const fantraxTeamId = (profile as { fantrax_team_id?: string | null } | null)?.fantrax_team_id ?? null;
  const rosteredPlayerIds = data.map((r) => r.player_id as string);
  const teamByPlayerId = Object.fromEntries(data.map((r) => [r.player_id as string, r.team_name as string]));
  const myTeamPlayerIds = fantraxTeamId
    ? data.filter((r) => (r.team_id as string) === fantraxTeamId).map((r) => r.player_id as string)
    : [];

  return { rosteredPlayerIds, teamByPlayerId, myTeamPlayerIds };
}
