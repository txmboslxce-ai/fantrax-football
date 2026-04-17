import { redirect } from "next/navigation";
import { SEASON, mapPosition } from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import MyLeagueClient, { type LeaguePlayerData, type LeagueTeam } from "./MyLeagueClient";

type ProfileRow = {
  fantrax_league_id: string | null;
  fantrax_league_last_synced_at: string | null;
  fantrax_team_id: string | null;
  fantrax_team_name: string | null;
};

type RosterRow = {
  player_id: string;
  team_id: string;
  team_name: string;
};

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: string;
  ownership_pct: string | null;
};

type GwRow = {
  player_id: string;
  games_played: number | null;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
};

function toNum(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseOwnership(value: string | null): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(n) ? n : 0;
}

export default async function MyLeaguePage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("fantrax_league_id, fantrax_league_last_synced_at, fantrax_team_id, fantrax_team_name")
    .eq("id", user.id)
    .maybeSingle();

  const profileRow = profile as ProfileRow | null;
  const leagueId = profileRow?.fantrax_league_id ?? null;
  const lastSyncedAt = profileRow?.fantrax_league_last_synced_at ?? null;
  const savedTeamId = profileRow?.fantrax_team_id ?? null;
  const savedTeamName = profileRow?.fantrax_team_name ?? null;

  if (!leagueId) {
    return <MyLeagueClient leagueId={null} lastSyncedAt={null} teams={[]} players={[]} savedTeamId={null} savedTeamName={null} />;
  }

  // Load full roster data for the league view
  const { data: rosterRows } = await supabase
    .from("league_rosters")
    .select("player_id, team_id, team_name")
    .eq("profile_id", user.id);

  const roster = (rosterRows ?? []) as RosterRow[];
  const playerIds = roster.map((r) => r.player_id);

  if (playerIds.length === 0) {
    return <MyLeagueClient leagueId={leagueId} lastSyncedAt={lastSyncedAt} teams={[]} players={[]} savedTeamId={savedTeamId} savedTeamName={savedTeamName} />;
  }

  const [{ data: playerRows }, { data: gwRows }] = await Promise.all([
    supabase.from("players").select("id, name, team, position, ownership_pct").in("id", playerIds),
    supabase
      .from("player_gameweeks")
      .select("player_id, games_played, raw_fantrax_pts, ghost_pts")
      .eq("season", SEASON)
      .in("player_id", playerIds),
  ]);

  const playersById = new Map<string, PlayerRow>();
  for (const p of (playerRows ?? []) as PlayerRow[]) {
    playersById.set(p.id, p);
  }

  // Aggregate stats per player
  const statsByPlayer = new Map<string, { seasonPts: number; gwCount: number; ghostPts: number }>();
  for (const row of (gwRows ?? []) as GwRow[]) {
    if (!Number(row.games_played ?? 0)) continue;
    const existing = statsByPlayer.get(row.player_id);
    const pts = toNum(row.raw_fantrax_pts);
    const ghost = toNum(row.ghost_pts);
    if (existing) {
      existing.seasonPts += pts;
      existing.ghostPts += ghost;
      existing.gwCount++;
    } else {
      statsByPlayer.set(row.player_id, { seasonPts: pts, gwCount: 1, ghostPts: ghost });
    }
  }

  // Build teams list
  const teamsMap = new Map<string, string>();
  for (const r of roster) {
    teamsMap.set(r.team_id, r.team_name);
  }
  const teams: LeagueTeam[] = Array.from(teamsMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build player list
  const players: LeaguePlayerData[] = [];
  for (const r of roster) {
    const p = playersById.get(r.player_id);
    if (!p) continue;
    const stats = statsByPlayer.get(r.player_id);
    const seasonPts = stats?.seasonPts ?? 0;
    const gwCount = stats?.gwCount ?? 0;
    const ghostPts = stats?.ghostPts ?? 0;

    players.push({
      playerId: r.player_id,
      playerName: p.name,
      position: mapPosition(p.position),
      team: p.team,
      teamId: r.team_id,
      teamName: r.team_name,
      ownershipPct: parseOwnership(p.ownership_pct),
      seasonPts: Math.round(seasonPts * 100) / 100,
      avgPtsPerGw: gwCount > 0 ? Math.round((seasonPts / gwCount) * 100) / 100 : 0,
      ghostPtsPerGw: gwCount > 0 ? Math.round((ghostPts / gwCount) * 100) / 100 : 0,
    });
  }

  return (
    <MyLeagueClient
      leagueId={leagueId}
      lastSyncedAt={lastSyncedAt}
      teams={teams}
      players={players}
      savedTeamId={savedTeamId}
      savedTeamName={savedTeamName}
    />
  );
}
