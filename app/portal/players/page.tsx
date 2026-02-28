import PlayersTableClient from "@/app/portal/players/PlayersTableClient";
import { isPremiumUserEmail } from "@/lib/premium";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PlayerWithStatsRow = {
  player_id: string;
  games_played: number;
  raw_fantrax_pts: number;
  ghost_pts: number;
  players:
    | {
        id: string;
        name: string;
        team: string;
        position: string;
        ownership_pct: string | null;
      }
    | Array<{
        id: string;
        name: string;
        team: string;
        position: string;
        ownership_pct: string | null;
      }>
    | null;
};

type AggregatedPlayer = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgPtsPerGw: number;
  ghostPtsPerGw: number;
  ownershipPct: number;
};

const SEASON = "2025-26";

function mapPosition(position: string): "GK" | "DEF" | "MID" | "FWD" {
  switch (position) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "M":
      return "MID";
    case "F":
      return "FWD";
    default:
      return "MID";
  }
}

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

export default async function PlayersPage() {
  const supabase = await createServerSupabaseClient();

  const [
    {
      data: { user },
    },
    { data, error },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("player_gameweeks")
      .select("player_id, games_played, raw_fantrax_pts, ghost_pts, players!inner(id, name, team, position, ownership_pct)")
      .eq("season", SEASON),
  ]);

  if (error) {
    throw new Error(`Unable to load players: ${error.message}`);
  }

  const byPlayer = new Map<
    string,
    {
      id: string;
      name: string;
      team: string;
      position: "GK" | "DEF" | "MID" | "FWD";
      ownershipPct: number;
      seasonPts: number;
      ghostPts: number;
      gamesPlayed: number;
    }
  >();

  for (const row of (data ?? []) as PlayerWithStatsRow[]) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    if (!player) {
      continue;
    }

    const existing = byPlayer.get(row.player_id);
    if (!existing) {
      byPlayer.set(row.player_id, {
        id: player.id,
        name: player.name,
        team: player.team,
        position: mapPosition(player.position),
        ownershipPct: parseOwnership(player.ownership_pct),
        seasonPts: row.games_played === 1 ? Number(row.raw_fantrax_pts ?? 0) : 0,
        ghostPts: row.games_played === 1 ? Number(row.ghost_pts ?? 0) : 0,
        gamesPlayed: row.games_played === 1 ? 1 : 0,
      });
      continue;
    }

    if (row.games_played === 1) {
      existing.seasonPts += Number(row.raw_fantrax_pts ?? 0);
      existing.ghostPts += Number(row.ghost_pts ?? 0);
      existing.gamesPlayed += 1;
    }
  }

  const players: AggregatedPlayer[] = Array.from(byPlayer.values()).map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    seasonPts: player.seasonPts,
    avgPtsPerGw: player.gamesPlayed > 0 ? player.seasonPts / player.gamesPlayed : 0,
    ghostPtsPerGw: player.gamesPlayed > 0 ? player.ghostPts / player.gamesPlayed : 0,
    ownershipPct: player.ownershipPct,
  }));

  players.sort((a, b) => b.seasonPts - a.seasonPts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Players</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Season {SEASON} player outputs. Click any row for player detail.</p>
      </div>
      <PlayersTableClient players={players} isPremiumUser={isPremiumUserEmail(user?.email)} />
    </div>
  );
}
