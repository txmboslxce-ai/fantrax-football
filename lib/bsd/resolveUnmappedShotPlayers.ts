import type { SupabaseClient } from "@supabase/supabase-js";
import { bzzoiroGet } from "@/lib/bsd/client";
import type { BsdPlayer } from "@/lib/bsd/players";

// matchCurrentPremierLeaguePlayers (lib/bsd/matchPlayers.ts) only ever
// offers players fetched off BSD's *live current-team roster* endpoint --
// a player who's already taken shots in a backfilled match (this season or
// PRIOR_SEASON) but hasn't yet shown up in that roster fetch (a very recent
// transfer BSD hasn't reflected yet, or a player who's since left the top
// flight entirely) never appears as a mapping candidate at all, even though
// their bsd_player_id is sitting right there in player_match_shot_stats
// with real shot data attached to it. This resolves a name/team for those
// ids directly from the match data itself, so they can be manually mapped
// too.
type ShotStatsRow = { bsd_player_id: number; bsd_event_id: number; team_abbrev: string };
type PlayerRow = { bsd_id: number };

type RawLineupPlayer = { id: number; name: string; short_name: string };
type RawTeamLineup = { players: RawLineupPlayer[]; substitutes: RawLineupPlayer[] };
type RawLineupsResponse = { lineups: { home: RawTeamLineup; away: RawTeamLineup } | null };

export async function resolveUnmappedShotPlayers(supabase: SupabaseClient): Promise<BsdPlayer[]> {
  const [{ data: shotRows, error: shotError }, { data: playerRows, error: playerError }] = await Promise.all([
    supabase.from("player_match_shot_stats").select("bsd_player_id, bsd_event_id, team_abbrev"),
    supabase.from("players").select("bsd_id").not("bsd_id", "is", null),
  ]);

  if (shotError) {
    throw new Error(`Unable to load player_match_shot_stats: ${shotError.message}`);
  }
  if (playerError) {
    throw new Error(`Unable to load players: ${playerError.message}`);
  }

  const alreadyMapped = new Set(((playerRows ?? []) as PlayerRow[]).map((row) => row.bsd_id));

  // One representative (event, team) per unmapped bsd_player_id is enough
  // to resolve a name -- no need to keep every match they appear in.
  const oneRowPerPlayer = new Map<number, ShotStatsRow>();
  for (const row of (shotRows ?? []) as ShotStatsRow[]) {
    if (alreadyMapped.has(row.bsd_player_id) || oneRowPerPlayer.has(row.bsd_player_id)) continue;
    oneRowPerPlayer.set(row.bsd_player_id, row);
  }

  const eventIds = Array.from(new Set(Array.from(oneRowPerPlayer.values()).map((row) => row.bsd_event_id)));

  const nameByPlayerId = new Map<number, string>();
  await Promise.all(
    eventIds.map(async (eventId) => {
      try {
        const data = await bzzoiroGet<RawLineupsResponse>(`/events/${eventId}/lineups/`, {}, 3600);
        for (const side of [data.lineups?.home, data.lineups?.away]) {
          for (const player of [...(side?.players ?? []), ...(side?.substitutes ?? [])]) {
            if (!nameByPlayerId.has(player.id)) nameByPlayerId.set(player.id, player.name);
          }
        }
      } catch {
        // A single event's lineups failing (e.g. not available for that
        // match) shouldn't sink the whole batch -- those players are just
        // left unresolved below.
      }
    })
  );

  const results: BsdPlayer[] = [];
  for (const [bsdPlayerId, row] of oneRowPerPlayer) {
    const name = nameByPlayerId.get(bsdPlayerId);
    if (!name) continue;
    results.push({ id: bsdPlayerId, name, shortName: name, teamId: 0, teamAbbrev: row.team_abbrev });
  }

  return results.sort((a, b) => a.teamAbbrev.localeCompare(b.teamAbbrev) || a.name.localeCompare(b.name));
}
